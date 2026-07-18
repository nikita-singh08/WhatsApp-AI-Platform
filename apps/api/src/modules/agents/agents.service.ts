import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';
import { MemoryService } from '../memory/memory.service';
import { KnowledgeBaseService } from '../knowledge/knowledge.service';
import { GeminiProvider, LLMMessage } from '@whatsai/ai';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class AgentsService {
  private readonly ai = new GeminiProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
    private readonly kbService: KnowledgeBaseService,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Helper to check plan limits before activating an agent
   */
  private async enforceActiveAgentLimit(orgId: string) {
    await this.billingService.checkOrgAgentsLimit(orgId);
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

  /**
   * Synchronously simulate agent reasoning path
   */
  async simulate(orgId: string, agentId: string, query: string, contactId?: string) {
    const agent = await this.prisma.client.agent.findFirst({
      where: { id: agentId, organizationId: orgId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // 1. Fetch matching Knowledge Base context (RAG)
    const matchedChunks = await this.kbService.querySimilarity(orgId, query, 3);
    const kbContext = matchedChunks.map((c: any) => c.content).join('\n---\n');

    // 2. Fetch Long-Term Memory facts (LTM)
    let ltmFacts: string[] = [];
    if (contactId) {
      ltmFacts = await this.memoryService.queryLongTermMemory(orgId, contactId, query, 2);
    }
    const ltmContext = ltmFacts.length > 0
      ? `Relevant historical customer facts:\n${ltmFacts.map((f: any) => `- ${f}`).join('\n')}`
      : '';

    // 3. Setup single user prompt query context
    const history: LLMMessage[] = [{ role: 'user', content: query }];

    // 4. Synthesize system prompt
    const systemInstruction = `${agent.systemPrompt}
    
Tones Guidelines: Ensure your response has a ${agent.tone || 'professional'} tone.
Language Guidelines: Write responses in the primary language: ${agent.language || 'en'}.

${ltmContext}

Use the following context from our official business knowledge base to formulate your response. If the context does not contain the answer, use your fallback response: "${agent.fallbackMessage || "I don't have that information. Let me connect you with a team member."}".
=== Context ===
${kbContext}
===============`;

    // 5. Generate chat response
    const response = await this.ai.generateChatCompletion({
      systemInstruction,
      messages: history,
    });

    // 6. Apply safety scrub simulation
    let sanitizedText = response.text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL MASKED]')
      .replace(/\+?[0-9]{3}-?[0-9]{6,10}/g, '[PHONE MASKED]');
    const badWords = [/fuck/gi, /shit/gi, /bitch/gi, /asshole/gi];
    for (const pattern of badWords) {
      sanitizedText = sanitizedText.replace(pattern, '****');
    }

    return {
      query,
      generatedResponse: sanitizedText,
      originalResponse: response.text,
      systemInstructionUsed: systemInstruction,
      matchedChunks: matchedChunks.map((c: any) => ({
        content: c.content,
        similarity: c.similarity,
      })),
      memoryFacts: ltmFacts,
      telemetry: {
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
      },
    };
  }
}
