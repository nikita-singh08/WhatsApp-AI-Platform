import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an audit event to the database
   */
  async log(params: {
    organizationId?: string;
    actorUserId?: string;
    actorType?: 'user' | 'system' | 'super_admin';
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: any;
    ipAddress?: string;
    impersonationSessionId?: string;
  }) {
    try {
      return await this.prisma.client.auditLog.create({
        data: {
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          actorType: params.actorType || 'user',
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          metadata: params.metadata || {},
          ipAddress: params.ipAddress,
          impersonationSessionId: params.impersonationSessionId,
        },
      });
    } catch (err) {
      console.error('[AuditLogsService] Failed to insert audit log:', err);
    }
  }

  /**
   * Retrieve audit logs for a workspace
   */
  async getLogs(orgId: string, page = 1, limit = 25) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.auditLog.count({
        where: { organizationId: orgId },
      }),
    ]);

    return { items, total, page, limit };
  }
}
