import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiProvider } from '@whatsai/ai';
import * as crypto from 'crypto';

@Injectable()
export class MemoryService {
  private ai = new GeminiProvider();

  constructor(private prisma: PrismaService) {}

  /**
   * Fetch recent message history (Short-Term Memory)
   */
  async getShortTermHistory(convId: string, limit: number = 10) {
    const messages = await this.prisma.client.message.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Reverse to chronological order
    return messages.reverse().map((m: any) => ({
      role: m.senderType === 'customer' ? 'user' : 'model',
      content: m.content,
    }));
  }

  /**
   * Query matching customer facts (Long-Term Memory)
   */
  async queryLongTermMemory(
    orgId: string,
    contactId: string,
    query: string,
    limit: number = 3,
  ) {
    const embResult = await this.ai.generateEmbedding({ text: query });
    const isMock = embResult.values.every((v) => v === 0);

    if (isMock) {
      // Offline/Dev fallback: substring contains match
      const items = await this.prisma.client.memory.findMany({
        where: {
          organizationId: orgId,
          contactId,
          content: { contains: query, mode: 'insensitive' },
        },
        take: limit,
      });

      return items.map((m: any) => m.content);
    }

    const vectorString = `[${embResult.values.join(',')}]`;

    try {
      const results: any[] = await this.prisma.client.$queryRawUnsafe(
        `SELECT content, 1 - (embedding <=> $1::vector) AS similarity 
         FROM memories 
         WHERE organization_id = $2::uuid AND contact_id = $3::uuid 
         ORDER BY embedding <=> $1::vector 
         LIMIT $4::int`,
        vectorString,
        orgId,
        contactId,
        limit,
      );

      return results.map((r: any) => r.content);
    } catch (err) {
      console.error('[Memory Query Vector Error]', err);
      return [];
    }
  }

  /**
   * Check if a new fact conflicts with any existing memories
   */
  async findConflictingMemory(orgId: string, contactId: string, newFact: string): Promise<string | null> {
    const existing = await this.prisma.client.memory.findMany({
      where: { contactId, organizationId: orgId },
    });

    if (existing.length === 0) return null;

    const listStr = existing.map((m) => `ID: ${m.id} - Content: "${m.content}"`).join('\n');

    const prompt = `New Fact: "${newFact}"
Existing Facts:
${listStr}

Does the New Fact contradict, correct, or update any of the Existing Facts?
If yes, return ONLY JSON containing:
{
  "conflicts": true,
  "conflictingMemoryId": "the-id-from-above-list"
}
If no conflict or update is found, return ONLY JSON containing:
{
  "conflicts": false
}`;

    try {
      const response = await this.ai.generateChatCompletion({
        messages: [{ role: 'user', content: prompt }],
      });
      const jsonStr = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed.conflicts && parsed.conflictingMemoryId) {
        return parsed.conflictingMemoryId;
      }
    } catch (e) {
      // Fallback: no conflict action
    }
    return null;
  }

  /**
   * Auto-extract user details / preferences via Gemini and save in long-term memory
   */
  async extractAndSaveFacts(orgId: string, contactId: string, convId: string, messageText: string) {
    const prompt = `Analyze this customer message: "${messageText}".
Extract any permanent user preferences, facts, or attributes (e.g. name, location preference, dietary notes, invoice request).
Return them as a comma-separated list of short claims. If no new attributes or facts are found, return exactly "NONE".`;

    try {
      const result = await this.ai.generateChatCompletion({
        messages: [{ role: 'user', content: prompt }],
      });

      const text = result.text.trim();
      if (text === 'NONE' || text.toLowerCase().includes('mock ai response') || text.includes('none')) {
        return;
      }

      const facts = text.split(',').map((f) => f.trim()).filter((f) => f.length > 0);

      for (const fact of facts) {
        // Resolve conflicts: older matching memory gets updated/deleted
        const conflictId = await this.findConflictingMemory(orgId, contactId, fact);
        if (conflictId) {
          console.log(`[MemoryService] Deleting conflicting memory fact: ${conflictId}`);
          await this.prisma.client.memory.delete({
            where: { id: conflictId },
          });
        }

        const embResult = await this.ai.generateEmbedding({ text: fact });
        const vectorString = `[${embResult.values.join(',')}]`;
        const memoryId = crypto.randomUUID();

        await this.prisma.client.$executeRawUnsafe(
          `INSERT INTO "memories" ("id", "organization_id", "contact_id", "conversation_id", "type", "content", "importance", "embedding", "created_at", "updated_at") 
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::int, $8::vector, NOW(), NOW())`,
          memoryId,
          orgId,
          contactId,
          convId,
          'customer_fact',
          fact,
          1,
          vectorString,
        );
        console.log(`[MemoryService] Saved fact: "${fact}" for contact ${contactId}`);
      }
    } catch (err) {
      console.error('[Memory Fact Extraction Failed]', err);
    }
  }
}
