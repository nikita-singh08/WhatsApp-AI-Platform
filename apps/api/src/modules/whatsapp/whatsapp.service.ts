import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectWhatsappDto } from './dto/connect-whatsapp.dto';
import { encrypt, decrypt, verifyMetaSignature, WhatsappClient } from '@whatsai/integrations';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebsocketsGateway } from '../websockets/websockets.gateway';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly websockets: WebsocketsGateway,
    @InjectQueue('incoming-message') private readonly incomingQueue: Queue,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Connect a WhatsApp Business account (Manual Config setup)
   */
  async connectAccount(orgId: string, dto: ConnectWhatsappDto) {
    // Enforce active numbers limit
    await this.billingService.checkOrgNumbersLimit(orgId);

    // 1. Enforce unique Phone Number ID across the platform
    const existing = await this.prisma.client.whatsappAccount.findUnique({
      where: { phoneNumberId: dto.phoneNumberId },
    });

    if (existing) {
      throw new BadRequestException('This WhatsApp Phone Number ID is already connected to another organization');
    }

    try {
      // 2. Validate token and fetch number details using WhatsappClient
      const details = await WhatsappClient.getAccountDetails(dto.phoneNumberId, dto.accessToken);

      // 3. Encrypt the access token
      const encryptedToken = encrypt(dto.accessToken);

      // 4. Save to database
      const account = await this.prisma.client.whatsappAccount.create({
        data: {
          organizationId: orgId,
          phoneNumberId: dto.phoneNumberId,
          metaBusinessAccountId: dto.metaBusinessAccountId,
          whatsappBusinessAccountId: dto.whatsappBusinessAccountId,
          accessTokenEncrypted: encryptedToken,
          displayPhoneNumber: details.displayPhoneNumber,
          verifiedName: details.verifiedName,
          qualityRating: details.qualityRating,
          registrationStatus: 'connected',
          setupMethod: 'manual',
          isActive: true,
        },
      });

      // Update onboarding progress
      await this.prisma.client.onboardingProgress.update({
        where: { organizationId: orgId },
        data: { whatsappConnected: true },
      });

      return account;
    } catch (error: any) {
      throw new BadRequestException(`Failed to connect WhatsApp account: ${error.message}`);
    }
  }

  /**
   * List connected WhatsApp accounts
   */
  async getAccounts(orgId: string) {
    return this.prisma.client.whatsappAccount.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        phoneNumberId: true,
        displayPhoneNumber: true,
        verifiedName: true,
        qualityRating: true,
        registrationStatus: true,
        createdAt: true,
      },
    });
  }

  /**
   * Disconnect/Remove a WhatsApp account
   */
  async disconnectAccount(orgId: string, accountId: string) {
    const account = await this.prisma.client.whatsappAccount.findFirst({
      where: { id: accountId, organizationId: orgId },
    });

    if (!account) {
      throw new NotFoundException('WhatsApp account not found in this organization');
    }

    // Set active status to false (soft delete to preserve message history)
    await this.prisma.client.whatsappAccount.update({
      where: { id: accountId },
      data: {
        isActive: false,
        registrationStatus: 'disconnected',
      },
    });

    return { message: 'WhatsApp account disconnected successfully' };
  }

  /**
   * Webhook Verification GET
   */
  verifyWebhook(query: { 'hub.mode': string; 'hub.verify_token': string; 'hub.challenge': string }) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'whatsai_verify_token_123';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Webhook] Meta validation success!');
      return challenge;
    }
    
    throw new ForbiddenException('Webhook verification failed');
  }

  /**
   * Incoming Webhook Event Processing
   */
  async handleWebhookPayload(rawBody: string, signature: string, payload: any) {
    const appSecret = process.env.META_APP_SECRET || 'meta_app_secret_123';
    
    // 1. Verify HMAC-SHA256 Signature
    const isValid = verifyMetaSignature(rawBody, signature, appSecret);
    if (!isValid) {
      console.warn('[Webhook] Invalid Meta signature received');
      throw new ForbiddenException('Invalid webhook signature');
    }

    // 2. Log webhook event in database
    const eventId = payload.entry?.[0]?.id || `evt_${Date.now()}`;
    
    const event = await this.prisma.client.webhookEvent.create({
      data: {
        provider: 'meta',
        eventId,
        payload,
        status: 'received',
      },
    });

    // 3. Process webhook events asynchronously
    // In MVP, we search entries for messages
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value || changes.field !== 'messages') {
      // Not a message event - mark as processed
      await this.prisma.client.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'processed', processedAt: new Date() },
      });
      return { success: true };
    }

    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) {
      await this.prisma.client.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'processed', processedAt: new Date() },
      });
      return { success: true };
    }

    // Resolve owner account and organization
    const account = await this.prisma.client.whatsappAccount.findUnique({
      where: { phoneNumberId },
    });

    if (!account || !account.isActive) {
      await this.prisma.client.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'failed',
          errorMessage: `WhatsApp Phone ID ${phoneNumberId} is not connected or active in the platform`,
        },
      });
      return { success: true };
    }

    // Associate webhook event with organization
    await this.prisma.client.webhookEvent.update({
      where: { id: event.id },
      data: {
        organizationId: account.organizationId,
        whatsappAccountId: account.id,
      },
    });

    // Extract message status callback
    if (value.statuses) {
      const statusUpdate = value.statuses[0];
      const messageId = statusUpdate.id;
      const deliveryStatus = statusUpdate.status; // sent, delivered, read, failed
      
      const message = await this.prisma.client.message.findUnique({
        where: { whatsappMessageId: messageId },
      });

      if (message) {
        await this.prisma.client.message.update({
          where: { id: message.id },
          data: {
            deliveryStatus,
            deliveryFailureReason: statusUpdate.errors?.[0]?.message || null,
          },
        });
      }

      await this.prisma.client.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'processed', processedAt: new Date() },
      });
      return { success: true };
    }

    // Extract message content
    if (value.messages) {
      const waMsg = value.messages[0];
      const messageId = waMsg.id;
      const contactInfo = value.contacts?.[0];
      const waId = waMsg.from; // Customer WA ID (phone number)
      const name = contactInfo?.profile?.name || waId;

      // Deduplicate by message ID
      const existingMsg = await this.prisma.client.message.findUnique({
        where: { whatsappMessageId: messageId },
      });

      if (existingMsg) {
        await this.prisma.client.webhookEvent.update({
          where: { id: event.id },
          data: { status: 'processed', processedAt: new Date() },
        });
        return { success: true };
      }

      // Create or update contact
      const contact = await this.prisma.client.contact.upsert({
        where: {
          organizationId_waId: {
            organizationId: account.organizationId,
            waId,
          },
        },
        create: {
          organizationId: account.organizationId,
          waId,
          name,
          phoneNumber: waId,
        },
        update: {
          name,
        },
      });

      // Find or create conversation
      let conversation = await this.prisma.client.conversation.findFirst({
        where: {
          organizationId: account.organizationId,
          contactId: contact.id,
          status: { not: 'resolved' },
        },
      });

      if (!conversation) {
        conversation = await this.prisma.client.conversation.create({
          data: {
            organizationId: account.organizationId,
            whatsappAccountId: account.id,
            contactId: contact.id,
            status: 'new',
          },
        });
      }

      // Store inbound message
      const messageType = waMsg.type;
      let textBody = '';

      if (messageType === 'text') {
        textBody = waMsg.text?.body || '';
      } else {
        textBody = `[Media Received: ${messageType}]`;
      }

      const dbMessage = await this.prisma.client.message.create({
        data: {
          organizationId: account.organizationId,
          conversationId: conversation.id,
          direction: 'inbound',
          senderType: 'customer',
          whatsappMessageId: messageId,
          messageType,
          textBody,
          rawPayload: waMsg,
          deliveryStatus: 'delivered',
        },
      });

      // Update last message timestamps on conversation
      await this.prisma.client.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastCustomerMessageAt: new Date(),
          windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        },
      });

      // Broadcast customer incoming message in real-time
      this.websockets.broadcastToOrg(account.organizationId, 'message.created', dbMessage);

      // Enqueue job to background queue for AI processing
      await this.incomingQueue.add(
        'process-incoming',
        {
          organizationId: account.organizationId,
          conversationId: conversation.id,
          messageId: dbMessage.id,
        },
        {
          removeOnComplete: true,
          removeOnFail: 1000,
        }
      );

      // Mark webhook event as processed
      await this.prisma.client.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'processed', processedAt: new Date() },
      });
    }

    return { success: true };
  }
}

// Subclass helper to throw forbidden exceptions inside NestJS controller context
class ForbiddenException extends BadRequestException {}
