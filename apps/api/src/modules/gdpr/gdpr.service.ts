import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GDPRService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Trigger prune job on startup, then execute every 24 hours
    this.pruneOldConversations().catch((e) => console.error('[GDPRService] Automated pruning failed:', e));
    setInterval(() => {
      this.pruneOldConversations().catch((e) => console.error('[GDPRService] Automated pruning failed:', e));
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Compiles all customer details, conversations history, messages, and long term memories into a DSAR package
   */
  async compileDSAR(orgId: string, contactId: string) {
    const contact = await this.prisma.client.contact.findFirst({
      where: { id: contactId, organizationId: orgId },
      include: {
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        memories: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return {
      exportedAt: new Date(),
      organizationId: orgId,
      contact: {
        id: contact.id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        createdAt: contact.createdAt,
      },
      conversations: contact.conversations.map((c) => ({
        id: c.id,
        status: c.status,
        lastMessageAt: c.lastMessageAt,
        messages: c.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          senderType: m.senderType,
          messageType: m.messageType,
          textBody: m.textBody,
          createdAt: m.createdAt,
        })),
      })),
      memories: contact.memories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Delete a specific customer memory fact
   */
  async deleteMemoryFact(orgId: string, factId: string) {
    const fact = await this.prisma.client.memory.findUnique({
      where: { id: factId },
    });

    if (!fact || fact.organizationId !== orgId) {
      throw new NotFoundException('Memory fact not found inside this workspace.');
    }

    await this.prisma.client.memory.delete({
      where: { id: factId },
    });

    return { message: 'Memory fact deleted successfully' };
  }

  /**
   * Prune conversations older than workspace plan configuration retention periods
   */
  async pruneOldConversations() {
    console.log('[GDPRService] Running automated data retention pruning job...');
    const orgs = await this.prisma.client.organization.findMany();

    for (const org of orgs) {
      const sub = await this.prisma.client.subscription.findUnique({
        where: { organizationId: org.id },
      });
      const plan = sub?.plan || 'free';

      // Pruning thresholds: Free/Starter=30 days, Growth=90 days, Agency=365 days
      const retentionDays = plan === 'free' || plan === 'starter' ? 30 : plan === 'growth' ? 90 : 365;
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - retentionDays);

      const oldConvs = await this.prisma.client.conversation.findMany({
        where: {
          organizationId: org.id,
          lastMessageAt: { lt: thresholdDate },
        },
        select: { id: true },
      });

      const convIds = oldConvs.map((c) => c.id);

      if (convIds.length > 0) {
        await this.prisma.client.$transaction([
          this.prisma.client.message.deleteMany({
            where: { conversationId: { in: convIds } },
          }),
          this.prisma.client.memory.deleteMany({
            where: { conversationId: { in: convIds } },
          }),
          this.prisma.client.conversation.deleteMany({
            where: { id: { in: convIds } },
          }),
        ]);
        console.log(`[GDPRService] Pruned ${convIds.length} conversations older than ${retentionDays} days for workspace: ${org.name}`);
      }
    }
  }
}
