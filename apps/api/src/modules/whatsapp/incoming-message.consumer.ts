import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from '../memory/memory.service';
import { KnowledgeBaseService } from '../knowledge/knowledge.service';
import { WebsocketsGateway } from '../websockets/websockets.gateway';
import { GeminiProvider, LLMMessage } from '@whatsai/ai';
import { WhatsappClient } from '@whatsai/integrations';
import { decrypt } from '@whatsai/integrations';
import { BillingService } from '../billing/billing.service';
import { ConversationsService } from '../conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';

@Processor('incoming-message')
@Injectable()
export class IncomingMessageConsumer extends WorkerHost {
  private ai = new GeminiProvider();

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
    private kbService: KnowledgeBaseService,
    private websockets: WebsocketsGateway,
    private billingService: BillingService,
    private conversationsService: ConversationsService,
    private notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { organizationId, conversationId, messageId } = job.data;
    console.log(`[IncomingMessageConsumer] Processing job ${job.id} for message: ${messageId}`);

    // 1. Fetch message and conversation
    const message = await this.prisma.client.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      console.warn(`[IncomingMessageConsumer] Message ${messageId} not found in DB`);
      return;
    }

    const conversation = await this.prisma.client.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true },
    });

    if (!conversation) {
      console.warn(`[IncomingMessageConsumer] Conversation ${conversationId} not found in DB`);
      return;
    }

    // 2. Check Operator Takeover Status
    if (conversation.status === 'operator') {
      console.log(`[IncomingMessageConsumer] Skip AI reply: Operator Takeover is active on conversation ${conversationId}`);
      return;
    }

    // Check monthly message limit & daily cost cap
    try {
      const stats = await this.billingService.getUsageStats(organizationId);
      if (stats.usage.messagesSentThisMonth >= stats.limits.maxMessagesPerMonth) {
        throw new Error('Monthly message limit reached for your plan.');
      }
      await this.billingService.trackAndCheckCostCap(organizationId, 0);
    } catch (limitErr: any) {
      console.warn(`[IncomingMessageConsumer] Limit blocked AI reply: ${limitErr.message}`);
      const sysMsg = await this.prisma.client.message.create({
        data: {
          organizationId,
          conversationId,
          senderType: 'system',
          direction: 'outbound',
          messageType: 'text',
          textBody: `AI reply paused: ${limitErr.message}`,
          deliveryStatus: 'sent',
        },
      });
      this.websockets.broadcastToOrg(organizationId, 'message.created', sysMsg);
      return;
    }

    // 3. Verify 24-Hour Messaging Window
    const now = new Date();
    if (conversation.windowExpiresAt && conversation.windowExpiresAt < now) {
      console.log(`[IncomingMessageConsumer] Skip AI reply: 24-hour messaging window expired for conversation ${conversationId}`);
      // Log system warning message
      const sysMsg = await this.prisma.client.message.create({
        data: {
          organizationId,
          conversationId,
          senderType: 'system',
          direction: 'outbound',
          messageType: 'text',
          textBody: '24-hour messaging window has expired. AI automation paused until customer messages again.',
          deliveryStatus: 'sent',
        },
      });
      this.websockets.broadcastToOrg(organizationId, 'message.created', sysMsg);
      return;
    }

    // 4. Verify Business Working Hours (Mock implementation based on timezone)
    // We assume default working hours are 8:00 AM to 6:00 PM organization local time.
    const org = await this.prisma.client.organization.findUnique({
      where: { id: organizationId },
    });
    
    const tz = org?.timezone || 'UTC';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const currentHour = parseInt(formatter.format(now), 10);

    if (currentHour < 8 || currentHour >= 18) {
      console.log(`[IncomingMessageConsumer] Time ${currentHour} is outside working hours (8-18) for timezone ${tz}`);
      
      const fallbackReply = 'Thank you for messaging us! Our team is currently offline. We will get back to you during our business hours (8:00 AM - 6:00 PM).';
      
      await this.sendOutboundReply(organizationId, conversationId, conversation.contact.phoneNumber || '', fallbackReply);
      return;
    }

    // Check for Human Escalation Keywords
    const keywords = ['human', 'operator', 'agent', 'support', 'representative', 'person', 'help'];
    const isEscalation = keywords.some((k) => message.textBody?.toLowerCase().includes(k));
    if (isEscalation) {
      console.log(`[IncomingMessageConsumer] Human escalation keyword triggered for conversation ${conversationId}`);
      
      await this.prisma.client.conversation.update({
        where: { id: conversationId },
        data: { status: 'needs_human' },
      });

      // Allocate operator via load-balanced round robin
      await this.conversationsService.autoAssignConversation(organizationId, conversationId);

      // Dispatch notification to operators/admins
      await this.notificationsService.dispatchNotification(organizationId, {
        type: 'escalation',
        title: 'Human Escalation Requested',
        body: `Customer ${conversation.contact.name || conversation.contact.phoneNumber} requested manual operator takeover.`,
      });

      const fallbackReply = 'I am connecting you with a support representative. Please wait a moment.';
      await this.sendOutboundReply(organizationId, conversationId, conversation.contact.phoneNumber || '', fallbackReply);
      return;
    }

    // 5. Fetch Active AI Agent Prompt
    const agent = await this.prisma.client.agent.findFirst({
      where: { organizationId, status: 'active' },
    });

    if (!agent) {
      console.log(`[IncomingMessageConsumer] No active AI Agent found for organization ${organizationId}`);
      return;
    }

    // Inform frontend via WebSockets that the AI is typing
    this.websockets.broadcastToOrg(organizationId, 'agent.typing', { conversationId, typing: true });

    try {
      // 6. RAG: Retrieve matching Knowledge Base chunks
      const matchedChunks = await this.kbService.querySimilarity(organizationId, message.textBody || '', 3);
      const kbContext = matchedChunks.map((c: any) => c.content).join('\n---\n');

      // 7. Long-Term Memory retrieval
      const ltmFacts = await this.memoryService.queryLongTermMemory(organizationId, conversation.contactId, message.textBody || '', 2);
      const ltmContext = ltmFacts.length > 0
        ? `Relevant historical customer facts:\n${ltmFacts.map((f: any) => `- ${f}`).join('\n')}`
        : '';

      // 8. Short-Term History Context
      const historyRaw = await this.memoryService.getShortTermHistory(conversationId, 10);
      const history: LLMMessage[] = historyRaw.map((h: any) => ({
        role: h.role as 'user' | 'model' | 'system',
        content: h.content || '',
      }));

      // 9. Synthesize system prompt
      const systemInstruction = `${agent.systemPrompt}
      
Tones Guidelines: Ensure your response has a ${agent.tone || 'professional'} tone.
Language Guidelines: Write responses in the primary language: ${agent.language || 'en'}.

${ltmContext}

Use the following context from our official business knowledge base to formulate your response. If the context does not contain the answer, use your fallback response: "${agent.fallbackMessage || "I don't have that information. Let me connect you with a team member."}".
=== Context ===
${kbContext}
===============`;

      // 10. Invoke Gemini API
      console.log(`[IncomingMessageConsumer] Generating reply for query: "${message.textBody}"`);
      const response = await this.ai.generateChatCompletion({
        systemInstruction,
        messages: history,
      });

      // Track cost details
      const costCents = Math.max(1, Math.round((response.promptTokens * 0.0000075 + response.completionTokens * 0.00003) * 100));
      await this.billingService.trackAndCheckCostCap(organizationId, costCents, response.totalTokens);

      // 11. Safety checks (Scrub PII and Mask Profanity)
      const sanitizedReply = this.applySafetyFilters(response.text);

      // 12. Send reply via WhatsApp Meta API and save message
      await this.sendOutboundReply(organizationId, conversationId, conversation.contact.phoneNumber || '', sanitizedReply, response);

      // 13. Auto-Extract details for Long-Term Memory (in background)
      this.memoryService.extractAndSaveFacts(organizationId, conversation.contactId, conversationId, message.textBody || '')
        .catch((err) => console.error('[IncomingMessageConsumer LTM Background Error]', err));

    } catch (err: any) {
      console.error('[IncomingMessageConsumer Error]', err);
      // Send fallback error warning
      const fallback = agent.fallbackMessage || "I'm having trouble processing that query. Let me connect you with a team member.";
      await this.sendOutboundReply(organizationId, conversationId, conversation.contact.phoneNumber || '', fallback);
    } finally {
      // Clear typing indicator
      this.websockets.broadcastToOrg(organizationId, 'agent.typing', { conversationId, typing: false });
    }
  }

  private async sendOutboundReply(
    orgId: string,
    convId: string,
    phoneNumber: string,
    text: string,
    aiResult?: any,
  ) {
    const whatsappAccount = await this.prisma.client.whatsappAccount.findFirst({
      where: { organizationId: orgId, isActive: true },
    });

    let whatsappMessageId = 'ai_mock_id_' + Date.now();

    if (whatsappAccount) {
      try {
        const decryptedToken = decrypt(whatsappAccount.accessTokenEncrypted);
        const res = await WhatsappClient.sendMessage({
          phoneNumberId: whatsappAccount.phoneNumberId,
          accessToken: decryptedToken,
          recipientWaId: phoneNumber,
          messageType: 'text',
          textBody: text,
        });
        whatsappMessageId = res.whatsappMessageId;
      } catch (err) {
        console.error('[IncomingMessageConsumer Outbound Send API Failure]', err);
      }
    }

    // Save outbound message to DB
    const dbMsg = await this.prisma.client.message.create({
      data: {
        organizationId: orgId,
        conversationId: convId,
        senderType: 'ai',
        direction: 'outbound',
        messageType: 'text',
        textBody: text,
        deliveryStatus: 'sent',
        whatsappMessageId,
      },
    });

    // Save cost tracking if AI logs token details
    if (aiResult && aiResult.promptTokens) {
      await this.prisma.client.agentRun.create({
        data: {
          organizationId: orgId,
          agentId: (await this.prisma.client.agent.findFirst({ where: { organizationId: orgId, status: 'active' } }))?.id || '',
          conversationId: convId,
          status: 'success',
          promptTokens: aiResult.promptTokens,
          completionTokens: aiResult.completionTokens,
          totalTokens: aiResult.totalTokens,
        },
      }).catch((e: any) => console.error('Failed to log AgentRun cost telemetry', e));
    }

    // Update conversation last message timestamp
    await this.prisma.client.conversation.update({
      where: { id: convId },
      data: { lastMessageAt: new Date() },
    });

    // Broadcast update to inbox clients
    this.websockets.broadcastToOrg(orgId, 'message.created', dbMsg);
  }

  private applySafetyFilters(text: string): string {
    // 1. Simple PII Scrubbing (emails and general phone formats)
    let sanitized = text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL MASKED]')
      .replace(/\+?[0-9]{3}-?[0-9]{6,10}/g, '[PHONE MASKED]');

    // 2. Simple Profanity Masking
    const badWords = [/fuck/gi, /shit/gi, /bitch/gi, /asshole/gi];
    for (const pattern of badWords) {
      sanitized = sanitized.replace(pattern, '****');
    }

    return sanitized;
  }
}
