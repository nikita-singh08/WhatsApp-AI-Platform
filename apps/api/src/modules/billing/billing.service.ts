import { Injectable, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_CONFIGS, PlanConfig, UserRole } from '@whatsai/shared';
import Stripe from 'stripe';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BillingService implements OnModuleInit {
  private stripe: Stripe | null = null;
  private isSimulatedMode = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && !stripeKey.startsWith('mock_') && stripeKey !== 'dummy') {
      this.stripe = new Stripe(stripeKey, {
        apiVersion: '2024-04-10' as any,
      });
      this.isSimulatedMode = false;
      console.log('[BillingService] Running in Stripe Live/Test API Mode');
    } else {
      console.log('[BillingService] Running in SIMULATED Mode (no active Stripe credentials)');
    }
  }

  /**
   * Fetch active subscription for organization, fallback to 'free' plan if none exists
   */
  async getSubscription(orgId: string) {
    let sub = await this.prisma.client.subscription.findUnique({
      where: { organizationId: orgId },
    });

    if (!sub) {
      sub = await this.prisma.client.subscription.create({
        data: {
          organizationId: orgId,
          plan: 'free',
          status: 'active',
          billingInterval: 'monthly',
        },
      });
    }
    return sub;
  }

  /**
   * Fetch configuration limits associated with active subscription plan
   */
  async getPlanConfig(orgId: string): Promise<PlanConfig> {
    const sub = await this.getSubscription(orgId);
    const plan = sub.plan.toLowerCase();
    return PLAN_CONFIGS[plan] || PLAN_CONFIGS.free;
  }

  /**
   * Check total organizations count limit for a user
   */
  async checkUserOrgsLimit(userId: string) {
    const ownedOrgsCount = await this.prisma.client.organizationMember.count({
      where: {
        userId,
        role: 'owner',
        status: 'active',
      },
    });

    // Enforce global hard-cap of max 3 organizations per user as per roadmap
    if (ownedOrgsCount >= 3) {
      throw new ForbiddenException('You cannot create more than 3 workspaces.');
    }
  }

  /**
   * Check numbers limits for workspace
   */
  async checkOrgNumbersLimit(orgId: string) {
    const config = await this.getPlanConfig(orgId);
    const count = await this.prisma.client.whatsappAccount.count({
      where: { organizationId: orgId, isActive: true },
    });

    if (count >= config.maxNumbers) {
      throw new ForbiddenException(
        `Workspace limit reached. Your plan allows max ${config.maxNumbers} active WhatsApp number(s).`
      );
    }
  }

  /**
   * Check active agents count limit
   */
  async checkOrgAgentsLimit(orgId: string) {
    const config = await this.getPlanConfig(orgId);
    const count = await this.prisma.client.agent.count({
      where: { organizationId: orgId, status: 'active' },
    });

    if (count >= config.maxAgents) {
      throw new ForbiddenException(
        `Workspace limit reached. Your plan allows max ${config.maxAgents} active AI Agent(s).`
      );
    }
  }

  /**
   * Check seat allocation limits (members + pending invites)
   */
  async checkOrgSeatsLimit(orgId: string) {
    const config = await this.getPlanConfig(orgId);

    const membersCount = await this.prisma.client.organizationMember.count({
      where: { organizationId: orgId, status: 'active' },
    });

    const pendingInvitesCount = await this.prisma.client.invitation.count({
      where: { organizationId: orgId, status: 'pending' },
    });

    const totalAllocated = membersCount + pendingInvitesCount;

    if (totalAllocated >= config.maxSeats) {
      throw new ForbiddenException(
        `Workspace limit reached. Your plan allows max ${config.maxSeats} seat(s). Please remove a member or cancel a pending invite first.`
      );
    }
  }

  /**
   * Check total knowledge base storage limits
   */
  async checkOrgStorageLimit(orgId: string, newFileBytes: number) {
    const config = await this.getPlanConfig(orgId);

    const aggregate = await this.prisma.client.knowledgeDocument.aggregate({
      where: { organizationId: orgId },
      _sum: {
        fileSizeBytes: true,
      },
    });

    const currentBytes = aggregate._sum.fileSizeBytes || 0;
    const projectTotal = currentBytes + newFileBytes;

    if (projectTotal > config.maxKbStorageBytes) {
      const allowedMb = Math.round(config.maxKbStorageBytes / (1024 * 1024));
      throw new ForbiddenException(
        `Knowledge storage limit exceeded. Your plan allows max ${allowedMb} MB of files.`
      );
    }
  }

  async trackAndCheckCostCap(orgId: string, estimatedCostCents: number, tokensCount = 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const config = await this.getPlanConfig(orgId);
    const dailyCap = config.dailyCostCapCents;

    let tracking = await this.prisma.client.dailyCostTracking.findUnique({
      where: {
        organizationId_date: {
          organizationId: orgId,
          date: today,
        },
      },
    });

    if (!tracking) {
      tracking = await this.prisma.client.dailyCostTracking.create({
        data: {
          organizationId: orgId,
          date: today,
          costCapCents: dailyCap,
          estimatedCostCents: 0,
          totalTokens: 0,
        },
      });
    }

    if (tracking.capReached) {
      throw new ForbiddenException('Daily AI token cost cap reached. Outbound replies paused.');
    }

    const projectedCost = tracking.estimatedCostCents + estimatedCostCents;

    if (projectedCost > tracking.costCapCents) {
      // Mark as cap reached
      await this.prisma.client.dailyCostTracking.update({
        where: { id: tracking.id },
        data: {
          capReached: true,
          capReachedAt: new Date(),
          estimatedCostCents: projectedCost,
          totalTokens: { increment: tokensCount },
        },
      });

      // Dispatch daily cost cap warning alert
      await this.notificationsService.dispatchNotification(orgId, {
        type: 'cost_cap',
        title: 'Daily AI Cost Cap Exceeded',
        body: `Your organization has reached the daily limit of $${(tracking.costCapCents / 100).toFixed(2)}. AI automation replies have been paused.`,
      }).catch((e) => console.error('Failed to dispatch cost cap notification', e));

      throw new ForbiddenException('Daily AI cost cap exceeded. AI replies have been paused.');
    }

    // Increment usage
    await this.prisma.client.dailyCostTracking.update({
      where: { id: tracking.id },
      data: {
        estimatedCostCents: projectedCost,
        totalTokens: { increment: tokensCount },
      },
    });
  }

  /**
   * Generate Checkout URL
   */
  async createCheckoutSession(orgId: string, plan: string, interval: 'monthly' | 'yearly') {
    const targetPlan = plan.toLowerCase();
    if (!['starter', 'growth', 'agency', 'enterprise'].includes(targetPlan)) {
      throw new BadRequestException('Invalid subscription plan name selection.');
    }

    if (this.isSimulatedMode) {
      // Mocked Checkout: Directly upgrade subscription in DB
      await this.prisma.client.subscription.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          plan: targetPlan,
          status: 'active',
          billingInterval: interval,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          plan: targetPlan,
          status: 'active',
          billingInterval: interval,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return { url: `/settings?tab=billing&checkout=success&plan=${targetPlan}` };
    }

    // Live Stripe Mode
    const session = await this.stripe!.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `WhatsAI ${targetPlan.toUpperCase()} Plan`,
              description: `Subscription package tier: ${targetPlan}`,
            },
            // Map simple pricing tiers (cents): Starter=2900, Growth=7900, Agency=19900
            unit_amount: targetPlan === 'starter' ? 2900 : targetPlan === 'growth' ? 7900 : 19900,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.APP_URL}/settings?tab=billing&checkout=success`,
      cancel_url: `${process.env.APP_URL}/settings?tab=billing&checkout=cancel`,
      client_reference_id: orgId,
    });

    return { url: session.url };
  }

  /**
   * Generate Billing Customer Portal session redirect url
   */
  async createPortalSession(orgId: string) {
    if (this.isSimulatedMode) {
      return { url: `/settings?tab=billing&portal=mocked` };
    }

    const sub = await this.prisma.client.subscription.findUnique({
      where: { organizationId: orgId },
    });

    if (!sub || !sub.stripeCustomerId) {
      throw new BadRequestException('Stripe billing profile does not exist for this organization.');
    }

    const portal = await this.stripe!.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${process.env.APP_URL}/settings?tab=billing`,
    });

    return { url: portal.url };
  }

  /**
   * Handle Inbound Webhooks from Stripe APIs
   */
  async handleWebhook(signature: string, payload: Buffer) {
    if (this.isSimulatedMode) return;

    let event: Stripe.Event;
    try {
      event = this.stripe!.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || ''
      );
    } catch (err: any) {
      throw new BadRequestException(`Stripe Webhook Signature verification failed: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.client_reference_id;
        const stripeSubId = session.subscription as string;
        const stripeCustomerId = session.customer as string;

        if (orgId) {
          const stripeSub = (await this.stripe!.subscriptions.retrieve(stripeSubId)) as any;
          await this.prisma.client.subscription.upsert({
            where: { organizationId: orgId },
            create: {
              organizationId: orgId,
              stripeCustomerId,
              stripeSubscriptionId: stripeSubId,
              plan: 'starter', // Map according to stripe price metadata
              status: stripeSub.status,
              currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
              currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            },
            update: {
              stripeCustomerId,
              stripeSubscriptionId: stripeSubId,
              status: stripeSub.status,
              currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
              currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            },
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as any;
        const existing = await this.prisma.client.subscription.findFirst({
          where: { stripeSubscriptionId: stripeSub.id },
        });

        if (existing) {
          await this.prisma.client.subscription.update({
            where: { id: existing.id },
            data: {
              status: stripeSub.status,
              currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
              currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            },
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as any;
        const existing = await this.prisma.client.subscription.findFirst({
          where: { stripeSubscriptionId: stripeSub.id },
        });

        if (existing) {
          await this.prisma.client.subscription.update({
            where: { id: existing.id },
            data: {
              plan: 'free',
              status: 'canceled',
              stripeSubscriptionId: null,
            },
          });
        }
        break;
      }
    }
  }

  /**
   * Returns current billing period utilization metrics
   */
  async getUsageStats(orgId: string) {
    const config = await this.getPlanConfig(orgId);

    const activeNumbers = await this.prisma.client.whatsappAccount.count({
      where: { organizationId: orgId, isActive: true },
    });

    const activeAgents = await this.prisma.client.agent.count({
      where: { organizationId: orgId, status: 'active' },
    });

    const activeSeats = await this.prisma.client.organizationMember.count({
      where: { organizationId: orgId, status: 'active' },
    });

    const storageAggregate = await this.prisma.client.knowledgeDocument.aggregate({
      where: { organizationId: orgId },
      _sum: { fileSizeBytes: true },
    });
    const storageUsedBytes = storageAggregate._sum.fileSizeBytes || 0;

    // Monthly messages count
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const messagesCount = await this.prisma.client.message.count({
      where: {
        organizationId: orgId,
        direction: 'outbound',
        senderType: 'ai',
        createdAt: { gte: startOfMonth },
      },
    });

    return {
      plan: (await this.getSubscription(orgId)).plan,
      limits: {
        maxNumbers: config.maxNumbers,
        maxAgents: config.maxAgents,
        maxSeats: config.maxSeats,
        maxKbStorageBytes: config.maxKbStorageBytes,
        maxMessagesPerMonth: config.maxMessagesPerMonth,
        dailyCostCapCents: config.dailyCostCapCents,
      },
      usage: {
        numbers: activeNumbers,
        agents: activeAgents,
        seats: activeSeats,
        storageBytes: storageUsedBytes,
        messagesSentThisMonth: messagesCount,
      },
    };
  }

  /**
   * Returns daily AI Estimated Cost rollup stats for graphs
   */
  async getCostStats(orgId: string) {
    const rollups = await this.prisma.client.dailyCostTracking.findMany({
      where: { organizationId: orgId },
      orderBy: { date: 'desc' },
      take: 7,
    });

    return rollups.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      tokens: r.totalTokens,
      estimatedCostCents: r.estimatedCostCents,
      capReached: r.capReached,
    }));
  }

  /**
   * Update daily cost cap for the current day
   */
  async updateDailyCostCap(orgId: string, customCapCents: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tracking = await this.prisma.client.dailyCostTracking.findUnique({
      where: {
        organizationId_date: {
          organizationId: orgId,
          date: today,
        },
      },
    });

    if (tracking) {
      const capReached = tracking.estimatedCostCents >= customCapCents;
      return this.prisma.client.dailyCostTracking.update({
        where: { id: tracking.id },
        data: {
          costCapCents: customCapCents,
          capReached,
          capReachedAt: capReached ? (tracking.capReachedAt || new Date()) : null,
        },
      });
    } else {
      return this.prisma.client.dailyCostTracking.create({
        data: {
          organizationId: orgId,
          date: today,
          costCapCents: customCapCents,
          estimatedCostCents: 0,
          totalTokens: 0,
          capReached: false,
        },
      });
    }
  }
}
