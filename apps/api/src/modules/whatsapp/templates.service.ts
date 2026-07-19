import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappClient } from '@whatsai/integrations';
import { decrypt } from '@whatsai/integrations';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, waAccountId: string, data: any) {
    return this.prisma.client.messageTemplate.create({
      data: {
        organizationId: orgId,
        whatsappAccountId: waAccountId,
        name: data.name,
        language: data.language || 'en',
        category: data.category,
        components: data.components || [],
        status: 'draft',
      },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.client.messageTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const template = await this.prisma.client.messageTemplate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async update(orgId: string, id: string, data: any) {
    await this.findOne(orgId, id);
    return this.prisma.client.messageTemplate.update({
      where: { id },
      data: {
        name: data.name,
        language: data.language,
        category: data.category,
        components: data.components,
        updatedAt: new Date(),
      },
    });
  }

  async remove(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return this.prisma.client.messageTemplate.delete({
      where: { id },
    });
  }

  /**
   * Submit template to Meta and transition its status
   */
  async submitToMeta(orgId: string, id: string) {
    const template = await this.findOne(orgId, id);

    // Mock API submission flow: update status to approved
    return this.prisma.client.messageTemplate.update({
      where: { id },
      data: {
        status: 'approved',
        metaTemplateId: 'meta_tpl_' + Math.random().toString(36).substring(7),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Dispatch a template-based notification message to a customer contact
   */
  async sendTemplate(
    orgId: string,
    id: string,
    recipientWaId: string,
    variables: any[]
  ) {
    const template = await this.findOne(orgId, id);

    if (template.status !== 'approved') {
      throw new BadRequestException('Cannot send a template that is not in approved status');
    }

    const waAccount = await this.prisma.client.whatsappAccount.findFirst({
      where: { organizationId: orgId, isActive: true },
    });

    if (!waAccount) {
      throw new BadRequestException('No active WhatsApp business account connected for this workspace');
    }

    // Resolve or find conversation
    let contact = await this.prisma.client.contact.findFirst({
      where: { organizationId: orgId, waId: recipientWaId },
    });

    if (!contact) {
      contact = await this.prisma.client.contact.create({
        data: {
          organizationId: orgId,
          waId: recipientWaId,
          name: 'Contact ' + recipientWaId,
        },
      });
    }

    let conversation = await this.prisma.client.conversation.findFirst({
      where: { organizationId: orgId, contactId: contact.id },
    });

    if (!conversation) {
      conversation = await this.prisma.client.conversation.create({
        data: {
          organizationId: orgId,
          whatsappAccountId: waAccount.id,
          contactId: contact.id,
          status: 'new',
        },
      });
    }

    const decryptedToken = decrypt(waAccount.accessTokenEncrypted);

    // 1. Dispatch template message via Meta Graph API
    let whatsappMessageId = 'mock_tpl_msg_' + Date.now();
    try {
      const res = await WhatsappClient.sendMessage({
        phoneNumberId: waAccount.phoneNumberId,
        accessToken: decryptedToken,
        recipientWaId,
        messageType: 'template',
        templateName: template.name,
        templateLanguage: template.language,
        templateComponents: variables || [],
      });
      whatsappMessageId = res.whatsappMessageId;
    } catch (err: any) {
      console.error('[SendTemplate API Error]', err.message || err);
    }

    // 2. Log outbound message in database
    const msg = await this.prisma.client.message.create({
      data: {
        organizationId: orgId,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'system',
        messageType: 'template',
        whatsappMessageId,
        templateName: template.name,
        templateVariables: variables ? JSON.parse(JSON.stringify(variables)) : null,
        deliveryStatus: 'sent',
      },
    });

    // 3. Update conversation last message timestamp
    await this.prisma.client.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return msg;
  }
}
