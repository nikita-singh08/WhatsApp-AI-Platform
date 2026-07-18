import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiProvider } from '@whatsai/ai';
import * as crypto from 'crypto';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class KnowledgeBaseService {
  private ai = new GeminiProvider();

  constructor(
    private prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async createKnowledgeBase(orgId: string, name: string, description?: string) {
    return this.prisma.client.knowledgeBase.create({
      data: {
        organizationId: orgId,
        name,
        description,
      },
    });
  }

  async findBases(orgId: string) {
    return this.prisma.client.knowledgeBase.findMany({
      where: { organizationId: orgId },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    });
  }

  async uploadDocument(
    orgId: string,
    kbId: string,
    title: string,
    content: string,
    fileName?: string,
  ) {
    const kb = await this.prisma.client.knowledgeBase.findFirst({
      where: { id: kbId, organizationId: orgId },
    });

    if (!kb) {
      throw new NotFoundException('Knowledge Base not found');
    }

    // Check storage limits
    const contentSizeBytes = Buffer.byteLength(content, 'utf8');
    await this.billingService.checkOrgStorageLimit(orgId, contentSizeBytes);

    // 1. Create document entry
    const doc = await this.prisma.client.knowledgeDocument.create({
      data: {
        organizationId: orgId,
        knowledgeBaseId: kbId,
        title,
        sourceType: 'upload',
        fileName,
        processingStatus: 'processing',
      },
    });

    try {
      // 2. Perform chunking (~500 characters, ~50 characters overlap)
      const chunks = this.chunkText(content, 500, 50);

      // 3. Generate embeddings and save chunks via raw SQL (to bypass Prisma unsupported vector mapping)
      for (let i = 0; i < chunks.length; i++) {
        const textChunk = chunks[i];
        const embResult = await this.ai.generateEmbedding({ text: textChunk });
        const vectorString = `[${embResult.values.join(',')}]`;
        const chunkId = crypto.randomUUID();

        await this.prisma.client.$executeRawUnsafe(
          `INSERT INTO "knowledge_chunks" ("id", "organization_id", "knowledge_document_id", "chunk_index", "content", "embedding", "embedding_model_version", "created_at") 
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::int, $5::text, $6::vector, $7::text, NOW())`,
          chunkId,
          orgId,
          doc.id,
          i,
          textChunk,
          vectorString,
          'text-embedding-004',
        );
      }

      // Update status to complete
      await this.prisma.client.knowledgeDocument.update({
        where: { id: doc.id },
        data: { processingStatus: 'completed' },
      });
    } catch (err: any) {
      console.error('[Knowledge Upload Error]', err);
      await this.prisma.client.knowledgeDocument.update({
        where: { id: doc.id },
        data: {
          processingStatus: 'failed',
          errorMessage: err.message || 'Failed to process document embeddings',
        },
      });
      throw err;
    }

    return doc;
  }

  async querySimilarity(orgId: string, query: string, limit: number = 3) {
    const embResult = await this.ai.generateEmbedding({ text: query });
    const isMock = embResult.values.every((v) => v === 0);

    if (isMock) {
      // Offline/Dev fallback: substring ILIKE checks to mock cosine ranking
      const items = await this.prisma.client.knowledgeChunk.findMany({
        where: {
          organizationId: orgId,
          content: { contains: query, mode: 'insensitive' },
        },
        take: limit,
      });

      return items.map((c: any) => ({
        id: c.id,
        content: c.content,
        similarity: 0.95,
      }));
    }

    const vectorString = `[${embResult.values.join(',')}]`;

    try {
      const results: any[] = await this.prisma.client.$queryRawUnsafe(
        `SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity 
         FROM knowledge_chunks 
         WHERE organization_id = $2::uuid 
         ORDER BY embedding <=> $1::vector 
         LIMIT $3::int`,
        vectorString,
        orgId,
        limit,
      );

      return results.map((r: any) => ({
        id: r.id,
        content: r.content,
        similarity: Number(r.similarity),
      }));
    } catch (err) {
      console.error('[Vector Search Error]', err);
      return [];
    }
  }

  private chunkText(text: string, size: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    if (text.length <= size) {
      return [text];
    }

    while (start < text.length) {
      const end = Math.min(start + size, text.length);
      chunks.push(text.substring(start, end));
      start += size - overlap;
    }

    return chunks;
  }
}
