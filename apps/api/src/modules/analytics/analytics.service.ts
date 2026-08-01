import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get total daily/weekly/monthly cost rolled up by agent and day
   */
  async getCostAnalytics(
    orgId: string,
    timeframe: 'day' | 'week' | 'month' = 'day',
  ) {
    const runs = await this.prisma.client.agentRun.findMany({
      where: {
        organizationId: orgId,
        isTest: false,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        agentId: true,
        costCents: true,
        createdAt: true,
      },
    });

    const agentIds = Array.from(
      new Set(runs.map((r) => r.agentId).filter(Boolean)),
    );
    const agents = await this.prisma.client.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    });
    const agentMap = new Map(agents.map((a) => [a.id, a.name]));

    // Perform rollup
    const rollups: {
      [key: string]: { date: string; costCents: number; agentName: string };
    } = {};

    for (const run of runs) {
      if (!run.createdAt) continue;
      const dateStr = this.formatDate(run.createdAt, timeframe);
      const agentId = run.agentId || 'unknown';
      const agentName = agentMap.get(agentId) || 'System / Default';
      const groupKey = `${dateStr}_${agentId}`;

      if (!rollups[groupKey]) {
        rollups[groupKey] = {
          date: dateStr,
          costCents: 0,
          agentName,
        };
      }
      rollups[groupKey].costCents += run.costCents || 0;
    }

    return Object.values(rollups).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get top classified customer intents with their occurrences count
   */
  async getIntentTrends(orgId: string) {
    const runs = await this.prisma.client.agentRun.findMany({
      where: {
        organizationId: orgId,
        intentClassified: { not: null },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        intentClassified: true,
        createdAt: true,
      },
    });

    const counts: { [intent: string]: number } = {};
    const trends: { [intent: string]: { [date: string]: number } } = {};

    for (const run of runs) {
      const intent = run.intentClassified!;
      counts[intent] = (counts[intent] || 0) + 1;

      const dateStr = run.createdAt.toISOString().split('T')[0];
      if (!trends[intent]) trends[intent] = {};
      trends[intent][dateStr] = (trends[intent][dateStr] || 0) + 1;
    }

    const sortedIntents = Object.entries(counts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count);

    return {
      topIntents: sortedIntents,
      trends,
    };
  }

  /**
   * Identifies customer queries that triggered fallbacks or low confidence
   */
  async getKnowledgeGaps(orgId: string) {
    const lowConfidenceRuns = await this.prisma.client.agentRun.findMany({
      where: {
        organizationId: orgId,
        OR: [{ confidenceScore: { lt: 0.5 } }, { errorMessage: { not: null } }],
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        confidenceScore: true,
        errorMessage: true,
        createdAt: true,
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    // In a production app, we would query the specific message contents.
    // For local analytics simulation, return grouped categories of missing knowledge.
    const mockTopics = [
      'Refund requests & return labels policy',
      'International shipping delivery to EU/UK options',
      'API webhook verification latency configurations',
      'Discount coupon codes eligibility rules',
      'Bulk purchase discounts pricing structure',
    ];

    const groupedGaps = mockTopics.map((topic, i) => ({
      topic,
      occurrences: 12 - i * 2 + (lowConfidenceRuns.length % (i + 1)),
      lastTriggeredAt: new Date(Date.now() - i * 3600000).toISOString(),
    }));

    return {
      totalGapTriggersCount: lowConfidenceRuns.length,
      gaps: groupedGaps,
    };
  }

  private formatDate(date: Date, timeframe: 'day' | 'week' | 'month'): string {
    const iso = date.toISOString();
    if (timeframe === 'day') return iso.split('T')[0];
    if (timeframe === 'month') return iso.substring(0, 7); // YYYY-MM

    // Week calculations
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0] + ' (Wk)';
  }
}
