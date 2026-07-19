import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketsGateway } from '../websockets/websockets.gateway';

@Injectable()
export class ToolExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly websockets: WebsocketsGateway
  ) {}

  /**
   * Register a tool execution request
   */
  async createRequest(
    orgId: string,
    agentRunId: string,
    toolName: string,
    input: any,
    requiresApproval: boolean
  ) {
    const status = requiresApproval ? 'pending_approval' : 'executing';
    
    const execution = await this.prisma.client.toolExecution.create({
      data: {
        organizationId: orgId,
        agentRunId,
        toolName,
        input: input ? JSON.parse(JSON.stringify(input)) : null,
        status,
        requiresApproval,
      },
    });

    if (requiresApproval) {
      // Broadcast WebSocket notification to workspace operators
      this.websockets.broadcastToOrg(orgId, 'tool.pending_approval', execution);
    }

    return execution;
  }

  /**
   * Approve a pending tool execution
   */
  async approveRequest(orgId: string, id: string, userId: string) {
    const execution = await this.prisma.client.toolExecution.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!execution) {
      throw new NotFoundException('Tool execution request not found');
    }

    if (execution.status !== 'pending_approval') {
      throw new BadRequestException(`Cannot approve request in current status: ${execution.status}`);
    }

    const updated = await this.prisma.client.toolExecution.update({
      where: { id },
      data: {
        status: 'approved',
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
      include: {
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Broadcast update via WebSockets
    this.websockets.broadcastToOrg(orgId, 'tool.approved', updated);

    return updated;
  }

  /**
   * Reject a pending tool execution
   */
  async rejectRequest(orgId: string, id: string, userId: string) {
    const execution = await this.prisma.client.toolExecution.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!execution) {
      throw new NotFoundException('Tool execution request not found');
    }

    if (execution.status !== 'pending_approval') {
      throw new BadRequestException(`Cannot reject request in current status: ${execution.status}`);
    }

    const updated = await this.prisma.client.toolExecution.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
      include: {
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Broadcast update via WebSockets
    this.websockets.broadcastToOrg(orgId, 'tool.rejected', updated);

    return updated;
  }

  /**
   * List pending approvals for an organization
   */
  async findPending(orgId: string) {
    return this.prisma.client.toolExecution.findMany({
      where: { organizationId: orgId, status: 'pending_approval' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Complete tool execution
   */
  async completeExecution(id: string, output: any, durationMs?: number) {
    return this.prisma.client.toolExecution.update({
      where: { id },
      data: {
        status: 'completed',
        output: output ? JSON.parse(JSON.stringify(output)) : null,
        durationMs,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Fail tool execution
   */
  async failExecution(id: string, errorMessage: string, durationMs?: number) {
    return this.prisma.client.toolExecution.update({
      where: { id },
      data: {
        status: 'failed',
        errorMessage,
        durationMs,
        completedAt: new Date(),
      },
    });
  }
}
