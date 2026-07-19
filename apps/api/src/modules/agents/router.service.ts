import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiProvider } from '@whatsai/ai';

@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);
  private readonly ai = new GeminiProvider();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Determine which agent should handle the customer message using LLM-based intent classification
   */
  async routeMessage(
    orgId: string,
    waAccountId: string,
    messageText: string
  ): Promise<{ agentId: string; confidence: number; isDefaultFallback: boolean }> {
    // 1. Get all active agents in the organization
    const activeAgents = await this.prisma.client.agent.findMany({
      where: { organizationId: orgId, status: 'active' },
    });

    if (activeAgents.length === 0) {
      throw new Error(`No active agents configured for organization ${orgId}`);
    }

    // Find the default agent for this WhatsApp account
    const defaultMapping = await this.prisma.client.whatsappAccountAgent.findFirst({
      where: { whatsappAccountId: waAccountId, isDefault: true },
      include: { agent: true },
    });
    
    const defaultAgent = defaultMapping?.agent || activeAgents[0];

    // If there is only one agent, route directly to it with confidence 1.0
    if (activeAgents.length === 1) {
      return {
        agentId: activeAgents[0].id,
        confidence: 1.0,
        isDefaultFallback: false,
      };
    }

    // 2. Build the agents mapping metadata for the LLM prompt
    const agentsListStr = activeAgents
      .map(
        (a) =>
          `ID: ${a.id}\nName: ${a.name}\nType: ${a.type}\nDescription: ${
            a.description || 'No description provided.'
          }`
      )
      .join('\n\n');

    const prompt = `You are the routing controller for a multi-agent AI system.
Your job is to analyze the incoming customer query and match it to the most relevant agent from the list below.

=== List of Active Agents ===
${agentsListStr}
============================

Customer Query: "${messageText}"

Evaluate the query and output a JSON response containing:
1. "agentId": The exact ID of the matching agent, or null if no agent is a good match.
2. "confidence": A confidence score between 0.0 and 1.0 representing how confident you are in this selection.

Return ONLY the raw JSON block without markdown formatting or surrounding backticks. Example:
{
  "agentId": "uuid-here",
  "confidence": 0.85
}`;

    try {
      const response = await this.ai.generateChatCompletion({
        messages: [{ role: 'user', content: prompt }],
      });

      const jsonStr = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);

      if (parsed.agentId && parsed.confidence >= 0.5) {
        // Double-check if the classified agent is in our active list
        const exists = activeAgents.some((a) => a.id === parsed.agentId);
        if (exists) {
          this.logger.log(
            `Routed query to agent: ${parsed.agentId} with confidence: ${parsed.confidence}`
          );
          return {
            agentId: parsed.agentId,
            confidence: parsed.confidence,
            isDefaultFallback: false,
          };
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to classify intent using LLM: ${err.message}`);
    }

    // 3. Fallback to default agent if confidence is low or query parsing failed
    this.logger.log(`Routing query to default fallback agent: ${defaultAgent.id}`);
    return {
      agentId: defaultAgent.id,
      confidence: 0.0,
      isDefaultFallback: true,
    };
  }
}
