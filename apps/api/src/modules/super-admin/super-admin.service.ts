import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class SuperAdminService {
  private readonly jwtSecret = process.env.ENCRYPTION_KEY || 'default_jwt_secret_key';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rollup telemetry for all organizations
   */
  async getOrganizationsTelemetry() {
    const orgs = await this.prisma.client.organization.findMany({
      include: {
        subscription: true,
        _count: {
          select: {
            members: true,
            agents: true,
            whatsappAccounts: true,
            knowledgeBases: true,
          },
        },
      },
    });

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const telemetry = await Promise.all(
      orgs.map(async (org) => {
        // Count messages sent by organization this month
        const messagesCount = await this.prisma.client.message.count({
          where: {
            organizationId: org.id,
            direction: 'outbound',
            senderType: 'ai',
            createdAt: { gte: currentMonthStart },
          },
        });

        // Sum tokens from daily tracking
        const dailyTracking = await this.prisma.client.dailyCostTracking.aggregate({
          where: {
            organizationId: org.id,
            date: { gte: currentMonthStart },
          },
          _sum: {
            totalTokens: true,
            estimatedCostCents: true,
          },
        });

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: org.status,
          createdAt: org.createdAt,
          membersCount: org._count.members,
          agentsCount: org._count.agents,
          whatsappConnected: org._count.whatsappAccounts > 0,
          kbCount: org._count.knowledgeBases,
          subscription: org.subscription
            ? {
                plan: org.subscription.plan,
                status: org.subscription.status,
                expiresAt: org.subscription.currentPeriodEnd,
              }
            : { plan: 'free', status: 'active', expiresAt: null },
          usageThisMonth: {
            messagesSent: messagesCount,
            tokensConsumed: dailyTracking._sum.totalTokens || 0,
            estimatedCostCents: dailyTracking._sum.estimatedCostCents || 0,
          },
        };
      })
    );

    return telemetry;
  }

  /**
   * Suspend an organization
   */
  async suspendOrganization(orgId: string, adminUserId: string) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.client.organization.update({
      where: { id: orgId },
      data: { status: 'suspended' },
    });

    // Create Audit Log
    await this.prisma.client.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: adminUserId,
        actorType: 'super_admin',
        action: 'organization.suspend',
        resourceType: 'organization',
        resourceId: orgId,
      },
    });

    return updated;
  }

  /**
   * Unsuspend an organization
   */
  async unsuspendOrganization(orgId: string, adminUserId: string) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.client.organization.update({
      where: { id: orgId },
      data: { status: 'active' },
    });

    // Create Audit Log
    await this.prisma.client.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: adminUserId,
        actorType: 'super_admin',
        action: 'organization.unsuspend',
        resourceType: 'organization',
        resourceId: orgId,
      },
    });

    return updated;
  }

  /**
   * Configure/Toggle Feature Flag Override for a workspace
   */
  async toggleFeatureFlag(orgId: string, key: string, enabled: boolean, adminUserId: string) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const flag = await this.prisma.client.featureFlag.upsert({
      where: {
        key_organizationId: {
          key,
          organizationId: orgId,
        },
      },
      create: {
        key,
        value: enabled,
        organizationId: orgId,
      },
      update: {
        value: enabled,
      },
    });

    // Create Audit Log
    await this.prisma.client.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: adminUserId,
        actorType: 'super_admin',
        action: 'feature_flag.toggle',
        resourceType: 'feature_flag',
        resourceId: flag.id,
        metadata: { key, enabled },
      },
    });

    return flag;
  }

  /**
   * Generate temporary user impersonation session token
   */
  async impersonateUser(adminUserId: string, targetUserId: string) {
    const targetUser = await this.prisma.client.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user to impersonate not found');
    }

    if (targetUser.isPlatformAdmin) {
      throw new BadRequestException('Cannot impersonate another platform administrator.');
    }

    // Generate token valid for 2 hours with impersonation signature
    const token = jwt.sign(
      {
        userId: targetUserId,
        impersonatorUserId: adminUserId,
      },
      this.jwtSecret,
      { expiresIn: '2h' }
    );

    // Create Audit Log
    await this.prisma.client.auditLog.create({
      data: {
        actorUserId: adminUserId,
        actorType: 'super_admin',
        action: 'user.impersonate',
        resourceType: 'user',
        resourceId: targetUserId,
        metadata: { targetUserEmail: targetUser.email },
      },
    });

    return {
      sessionToken: token,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
      },
    };
  }
}
