import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('api/organizations/:orgId/analytics')
@UseGuards(AuthGuard, RbacGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('cost')
  @Roles('owner', 'admin', 'operator', 'readonly')
  async getCost(
    @Param('orgId') orgId: string,
    @Query('timeframe') timeframe?: 'day' | 'week' | 'month',
  ) {
    return this.analyticsService.getCostAnalytics(orgId, timeframe);
  }

  @Get('intents')
  @Roles('owner', 'admin', 'operator', 'readonly')
  async getIntents(@Param('orgId') orgId: string) {
    return this.analyticsService.getIntentTrends(orgId);
  }

  @Get('knowledge-gaps')
  @Roles('owner', 'admin', 'operator', 'readonly')
  async getKnowledgeGaps(@Param('orgId') orgId: string) {
    return this.analyticsService.getKnowledgeGaps(orgId);
  }
}
