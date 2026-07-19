import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketsGateway } from '../websockets/websockets.gateway';
import { WhatsappClient } from '@whatsai/integrations';
import { decrypt } from '@whatsai/integrations';

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private websockets: WebsocketsGateway,
  ) {}

  async findAll(orgId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const items = await this.prisma.client.conversation.findMany({
      where: { organizationId: orgId },
      include: {
        contact: true,
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await this.prisma.client.conversation.count({
      where: { organizationId: orgId },
    });

    return { items, total, page, limit };
  }

  async findMessages(orgId: string, convId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: convId, organizationId: orgId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const items = await this.prisma.client.message.findMany({
      where: { conversationId: convId, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    });

    const total = await this.prisma.client.message.count({
      where: { conversationId: convId, organizationId: orgId },
    });

    return { items, total, page, limit };
  }

  async manualReply(orgId: string, convId: string, operatorUserId: string, content: string) {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: convId, organizationId: orgId },
      include: {
        contact: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Find the linked whatsapp account for this conversation
    const whatsappAccount = await this.prisma.client.whatsappAccount.findFirst({
      where: { organizationId: orgId, isActive: true },
    });

    if (!whatsappAccount) {
      throw new BadRequestException('No active WhatsApp business account connected for this workspace');
    }

    const decryptedToken = decrypt(whatsappAccount.accessTokenEncrypted);

    // 1. Send message to WhatsApp via Meta API
    let whatsappMessageId = 'mock_id_' + Date.now();
    try {
      const res = await WhatsappClient.sendMessage({
        phoneNumberId: whatsappAccount.phoneNumberId,
        accessToken: decryptedToken,
        recipientWaId: conversation.contact.phoneNumber || '',
        messageType: 'text',
        textBody: content,
      });
      whatsappMessageId = res.whatsappMessageId;
    } catch (err: any) {
      console.error('[ManualReply WhatsApp API Error]', err.message || err);
    }

    // 2. Automatically trigger Takeover Enabled if not already active
    const isAlreadyTakeover = conversation.status === 'operator';
    let updatedConv: any = conversation;

    if (!isAlreadyTakeover) {
      updatedConv = await this.prisma.client.conversation.update({
        where: { id: convId },
        data: {
          status: 'operator',
          lastMessageAt: new Date(),
        },
      });

      // Insert system message about takeover
      const sysMsg = await this.prisma.client.message.create({
        data: {
          organizationId: orgId,
          conversationId: convId,
          senderType: 'system',
          direction: 'outbound',
          messageType: 'text',
          textBody: 'Manual Operator Takeover initiated. AI auto-responses are paused.',
          deliveryStatus: 'sent',
        },
      });

      this.websockets.broadcastToOrg(orgId, 'message.created', sysMsg);
    } else {
      await this.prisma.client.conversation.update({
        where: { id: convId },
        data: { lastMessageAt: new Date() },
      });
    }

    // 3. Create operator message
    const message = await this.prisma.client.message.create({
      data: {
        organizationId: orgId,
        conversationId: convId,
        senderType: 'human',
        whatsappMessageId,
        messageType: 'text',
        textBody: content,
        direction: 'outbound',
        deliveryStatus: 'sent',
      },
    });

    // 4. Broadcast events
    this.websockets.broadcastToOrg(orgId, 'message.created', message);
    if (!isAlreadyTakeover) {
      this.websockets.broadcastToOrg(orgId, 'conversation.updated', updatedConv);
    }

    return message;
  }

  async toggleTakeover(orgId: string, convId: string, takeover: boolean) {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: convId, organizationId: orgId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const currentStatus = conversation.status;
    const targetStatus = takeover ? 'operator' : 'active';

    if (currentStatus === targetStatus) {
      return conversation;
    }

    const updated = await this.prisma.client.conversation.update({
      where: { id: convId },
      data: {
        status: targetStatus,
        lastMessageAt: new Date(),
      },
    });

    // Insert system audit log message
    const sysMsg = await this.prisma.client.message.create({
      data: {
        organizationId: orgId,
        conversationId: convId,
        senderType: 'system',
        direction: 'outbound',
        messageType: 'text',
        textBody: takeover
          ? 'Operator Takeover manually enabled. AI responses are paused.'
          : 'Conversation handed back to AI. Auto-responses resumed.',
        deliveryStatus: 'sent',
      },
    });

    this.websockets.broadcastToOrg(orgId, 'message.created', sysMsg);
    this.websockets.broadcastToOrg(orgId, 'conversation.updated', updated);

    return updated;
  }

  /**
   * Automatically assigns an incoming or escalated conversation to an active operator
   * using load-balanced round-robin allocation
   */
  async autoAssignConversation(orgId: string, convId: string) {
    try {
      // 1. Fetch active operator-eligible members (owner, admin, operator)
      const operators = await this.prisma.client.organizationMember.findMany({
        where: {
          organizationId: orgId,
          role: { in: ['owner', 'admin', 'operator'] },
          status: 'active',
        },
      });

      if (operators.length === 0) return null;

      // 2. Count active assigned conversations for each operator to determine least-busy candidate
      const loadList = await Promise.all(
        operators.map(async (op) => {
          const count = await this.prisma.client.conversation.count({
            where: {
              organizationId: orgId,
              assignedUserId: op.userId,
            },
          });
          return { op, count };
        })
      );

      // 3. Sort by workload (ascending)
      loadList.sort((a, b) => a.count - b.count);
      const chosen = loadList[0].op;

      // 4. Assign conversation to operator
      const updated = await this.prisma.client.conversation.update({
        where: { id: convId },
        data: { assignedUserId: chosen.userId },
        include: {
          assignedUser: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // 5. Broadcast assignment event to workspace inbox clients
      this.websockets.broadcastToOrg(orgId, 'conversation.updated', updated);
      return updated;
    } catch (err) {
      console.error('[ConversationsService] Auto-assignment failed:', err);
      return null;
    }
  }

  /**
   * Manually reassign a conversation to another active agent
   */
  async reassignAgent(orgId: string, convId: string, agentId: string) {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: convId, organizationId: orgId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const agent = await this.prisma.client.agent.findFirst({
      where: { id: agentId, organizationId: orgId, status: 'active' },
    });

    if (!agent) {
      throw new NotFoundException('Active agent not found');
    }

    const updated = await this.prisma.client.conversation.update({
      where: { id: convId },
      data: { currentAgentId: agentId },
      include: {
        currentAgent: true,
      },
    });

    this.websockets.broadcastToOrg(orgId, 'conversation.updated', updated);
    return updated;
  }
}
