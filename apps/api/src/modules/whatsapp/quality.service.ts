import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappClient } from '@whatsai/integrations';
import { decrypt } from '@whatsai/integrations';

@Injectable()
export class QualityService {
  private readonly logger = new Logger(QualityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService
  ) {}

  /**
   * Poll Meta API for all WhatsApp account quality ratings and log changes
   */
  async pollQualityRatings() {
    this.logger.log('Running automated WhatsApp account quality ratings polling job...');
    const accounts = await this.prisma.client.whatsappAccount.findMany({
      where: { isActive: true },
    });

    for (const acc of accounts) {
      try {
        const decryptedToken = decrypt(acc.accessTokenEncrypted);
        let quality = 'green'; // Default mock status

        try {
          const details = await WhatsappClient.getAccountDetails(acc.phoneNumberId, decryptedToken);
          quality = details.qualityRating || 'green';
        } catch (e: any) {
          // If offline or mock token, keep green/unknown
          this.logger.warn(`Could not connect to Meta Graph API for account ${acc.id}, using mock rating: ${e.message}`);
        }

        // 1. Update WhatsappAccount status fields
        await this.prisma.client.whatsappAccount.update({
          where: { id: acc.id },
          data: {
            qualityRating: quality,
            qualityRatingUpdatedAt: new Date(),
          },
        });

        // 2. Add history log entry
        await this.prisma.client.qualityRatingHistory.create({
          data: {
            whatsappAccountId: acc.id,
            organizationId: acc.organizationId,
            rating: quality,
            recordedAt: new Date(),
          },
        });

        // 3. Check for quality degradation threshold and dispatch alerts
        if (quality === 'yellow' || quality === 'red') {
          await this.notificationsService.dispatchNotification(acc.organizationId, {
            type: 'quality_drop',
            title: `WhatsApp Quality Warning (${quality.toUpperCase()})`,
            body: `Your connected WhatsApp number ${acc.displayPhoneNumber || acc.phoneNumberId} has dropped to ${quality} status. Please check your template reports.`,
          });
        }
      } catch (err: any) {
        this.logger.error(`Failed to poll quality rating for account ${acc.id}: ${err.message}`);
      }
    }
  }

  /**
   * Track daily outbound limits based on Meta messaging tier
   */
  async trackAndEnforceOutboundRateLimits(orgId: string, waAccountId: string) {
    const acc = await this.prisma.client.whatsappAccount.findFirst({
      where: { id: waAccountId, organizationId: orgId },
    });

    if (!acc) return;

    // Reset counter if day has passed
    const now = new Date();
    const lastReset = acc.dailyOutboundResetAt || new Date(0);
    const dayHasPassed = now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();

    let count = acc.dailyOutboundCount;
    if (dayHasPassed) {
      count = 0;
      await this.prisma.client.whatsappAccount.update({
        where: { id: waAccountId },
        data: {
          dailyOutboundCount: 0,
          dailyOutboundResetAt: now,
        },
      });
    }

    // Determine tier limit
    let limit = 250;
    if (acc.messagingTier === 'TIER_1K') limit = 1000;
    if (acc.messagingTier === 'TIER_10K') limit = 10000;
    if (acc.messagingTier === 'TIER_100K') limit = 100000;
    if (acc.messagingTier === 'TIER_UNLIMITED') limit = Infinity;

    if (count >= limit) {
      await this.notificationsService.dispatchNotification(orgId, {
        type: 'limit_warning',
        title: 'Meta Daily Outbound Messaging Limit Reached',
        body: `Organization messaging tier limits (${limit} messages/day) exceeded. Outbound notifications paused.`,
      });
      throw new BadRequestException(`Meta tier daily outbound limit of ${limit} messages reached.`);
    }

    // Increment count
    await this.prisma.client.whatsappAccount.update({
      where: { id: waAccountId },
      data: {
        dailyOutboundCount: count + 1,
      },
    });
  }
}
