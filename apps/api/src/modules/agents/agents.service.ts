import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to check plan limits before activating an agent
   */
  private async enforceActiveAgentLimit(orgId: string) {
    const sub = await this.prisma.client.subscription.findUnique({
      where: { organizationId: orgId },
    });

    const plan = sub?.plan || 'free';
    const limit = plan === 'free' || plan === 'starter' ? 1 : 10; // Growth/Agency have more

    const activeCount = await this.prisma.client.agent.count({
      where: {
        organizationId: orgId,
        status: 'active',
      },
    });

    if (activeCount >= limit) {
      throw new BadRequestException(
        `Active agent limit reached for your plan (${plan}). Currently active: ${activeCount}/${limit}. Deactivate or archive another agent first.`
      );
    }
  }

  /**
   * Create Agent
   */
  async create(orgId: string, userId: string, dto: CreateAgentDto) {
    // Initial agent is created as draft status to avoid active limit check
    const agent = await this.prisma.client.$transaction(async (tx) => {
      const newAgent = await tx.agent.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          type: dto.type,
          description: dto.description,
          systemPrompt: dto.systemPrompt,
          tone: dto.tone || 'professional',
          language: dto.language || 'en',
          status: 'draft',
          escalationConfig: {
            sentiment_threshold: -0.5,
            human_request_detection: true,
            max_unresolved_turns: 10,
            escalation_keywords: [],
            confidence_threshold: 0.4,
          },
        },
      });

      // Save initial version
      await tx.agentVersion.create({
        data: {
          agentId: newAgent.id,
          versionNumber: 1,
          systemPrompt: newAgent.systemPrompt,
          config: JSON.parse(JSON.stringify(newAgent)),
          createdByUserId: userId,
        },
      });

      // Update onboarding progress
      await tx.onboardingProgress.update({
        where: { organizationId: orgId },
        data: { agentCreated: true },
      });

      return newAgent;
    });

    return agent;
  }

  /**
   * List agents
   */
  async findAll(orgId: string) {
    return this.prisma.client.agent.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Find single agent details
   */
  async findOne(orgId: string, agentId: string) {
    const agent = await this.prisma.client.agent.findFirst({
      where: { id: agentId, organizationId: orgId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return agent;
  }

  /**
   * Update Agent settings and save to version history
   */
  async update(orgId: string, agentId: string, userId: string, dto: UpdateAgentDto) {
    const agent = await this.prisma.client.agent.findFirst({
      where: { id: agentId, organizationId: orgId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // If activating, enforce plan limits
    if (dto.status === 'active' && agent.status !== 'active') {
      await this.enforceActiveAgentLimit(orgId);
    }

    const updatedAgent = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.agent.update({
        where: { id: agentId },
        data: {
          name: dto.name,
          description: dto.description,
          systemPrompt: dto.systemPrompt,
          tone: dto.tone,
          language: dto.language,
          businessRules: dto.businessRules,
          escalationConfig: dto.escalationConfig,
          strictKnowledgeMode: dto.strictKnowledgeMode,
          fallbackMessage: dto.fallbackMessage,
          humanEscalationEnabled: dto.humanEscalationEnabled,
          workingHours: dto.workingHours,
          outsideHoursMode: dto.outsideHoursMode,
          outsideHoursMessage: dto.outsideHoursMessage,
          aiDisclosureEnabled: dto.aiDisclosureEnabled,
          aiDisclosureMessage: dto.aiDisclosureMessage,
          allowedTools: dto.allowedTools,
          status: dto.status,
        },
      });

      // Increment version number and save version history
      const latestVersion = await tx.agentVersion.findFirst({
        where: { agentId },
        orderBy: { versionNumber: 'desc' },
      });

      const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

      // Save version snapshot
      await tx.agentVersion.create({
        data: {
          agentId,
          versionNumber: nextVersionNumber,
          systemPrompt: updated.systemPrompt,
          config: JSON.parse(JSON.stringify(updated)),
          createdByUserId: userId,
        },
      });

      // Keep only last 50 versions (pruning oldest)
      const versionCount = await tx.agentVersion.count({ where: { agentId } });
      if (versionCount > 50) {
        const oldestVersion = await tx.agentVersion.findFirst({
          where: { agentId },
          orderBy: { versionNumber: 'asc' },
        });
        if (oldestVersion) {
          await tx.agentVersion.delete({ where: { id: oldestVersion.id } });
        }
      }

      return updated;
    });

    return updatedAgent;
  }

  /**
   * Activate Agent and assign it to a WhatsApp Number ID
   */
  async activateAgent(orgId: string, agentId: string, whatsappAccountId: string) {
    const agent = await this.prisma.client.agent.findFirst({
      where: { id: agentId, organizationId: orgId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const waAccount = await this.prisma.client.whatsappAccount.findFirst({
      where: { id: whatsappAccountId, organizationId: orgId },
    });

    if (!waAccount) {
      throw new NotFoundException('WhatsApp account not found in this organization');
    }

    if (agent.status !== 'active') {
      await this.enforceActiveAgentLimit(orgId);
    }

    await this.prisma.client.$transaction([
      // 1. Set agent status to active
      this.prisma.client.agent.update({
        where: { id: agentId },
        data: { status: 'active' },
      }),
      // 2. Link WhatsApp number to this agent (delete old mapping if exists, 1:1 in MVP)
      this.prisma.client.whatsappAccountAgent.deleteMany({
        where: { whatsappAccountId },
      }),
      this.prisma.client.whatsappAccountAgent.create({
        data: {
          organizationId: orgId,
          whatsappAccountId,
          agentId,
          isDefault: true,
        },
      }),
    ]);

    return { message: 'Agent activated and linked successfully' };
  }

  /**
   * Archive Agent
   */
  async archiveAgent(orgId: string, agentId: string) {
    const agent = await this.prisma.client.agent.findFirst({
      where: { id: agentId, organizationId: orgId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    await this.prisma.client.$transaction([
      // 1. Set status to archived
      this.prisma.client.agent.update({
        where: { id: agentId },
        data: { status: 'archived' },
      }),
      // 2. Unlink from any WhatsApp numbers
      this.prisma.client.whatsappAccountAgent.deleteMany({
        where: { agentId },
      }),
    ]);

    return { message: 'Agent archived successfully' };
  }
}
