import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketsGateway } from '../websockets/websockets.gateway';
import { NotificationDispatcher } from '@whatsai/notifications';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly websockets: WebsocketsGateway,
  ) {}

  /**
   * Fetch notification preferences for a user in a workspace
   */
  async getPreferences(orgId: string, userId: string) {
    return this.prisma.client.notificationPreference.findMany({
      where: { organizationId: orgId, userId },
    });
  }

  /**
   * Update notification preference channel
   */
  async updatePreference(orgId: string, userId: string, type: string, channel: string) {
    if (!['email', 'in_app', 'in_app_and_email', 'none'].includes(channel)) {
      throw new Error('Invalid notification channel option.');
    }

    // Critical configurations cannot be set to 'none' or completely disabled
    if (['billing_failure', 'whatsapp_failure', 'cost_cap'].includes(type) && channel === 'none') {
      throw new Error('Critical service alerts cannot be fully disabled.');
    }

    return this.prisma.client.notificationPreference.upsert({
      where: {
        userId_organizationId_notificationType: {
          userId,
          organizationId: orgId,
          notificationType: type,
        },
      },
      create: {
        userId,
        organizationId: orgId,
        notificationType: type,
        channel,
      },
      update: {
        channel,
      },
    });
  }

  /**
   * Send a system notification via ws and/or email based on user preferences
   */
  async dispatchNotification(
    orgId: string,
    params: {
      type: 'escalation' | 'whatsapp_failure' | 'billing_failure' | 'document_failure' | 'quality_drop' | 'limit_warning' | 'cost_cap';
      title: string;
      body: string;
      userId?: string; // Optional target user, otherwise alerts all admins/operators
    }
  ) {
    // 1. Find target recipients (admins and operators in the workspace)
    const members = await this.prisma.client.organizationMember.findMany({
      where: {
        organizationId: orgId,
        role: { in: ['owner', 'admin', 'operator'] },
        status: 'active',
      },
      include: { user: true },
    });

    const targets = params.userId ? members.filter((m) => m.userId === params.userId) : members;

    for (const member of targets) {
      // 2. Resolve preference channel
      const pref = await this.prisma.client.notificationPreference.findUnique({
        where: {
          userId_organizationId_notificationType: {
            userId: member.userId,
            organizationId: orgId,
            notificationType: params.type,
          },
        },
      });

      const channel = pref?.channel || 'in_app_and_email';

      // 3. Dispatch In-App Push via Socket.io
      if (channel.includes('in_app')) {
        this.websockets.broadcastToOrg(orgId, 'notification.created', {
          userId: member.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          createdAt: new Date(),
        });
      }

      // 4. Dispatch Email
      if (channel.includes('email') || ['billing_failure', 'whatsapp_failure', 'cost_cap'].includes(params.type)) {
        await NotificationDispatcher.sendEmail({
          to: member.user.email,
          subject: `[WhatsAI Alert] ${params.title}`,
          body: `Hi ${member.user.name || 'Workspace User'},\n\nWe have detected a new workspace alert:\n\nTitle: ${params.title}\nDescription: ${params.body}\n\nManage your notification settings in your dashboard general preferences pane.\n\nBest Regards,\nWhatsAI Team`,
        }).catch((err) => console.error('[NotificationsService] Email dispatch failed:', err));
      }
    }
  }
}
