import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/organizations/:orgId/audit-logs')
@UseGuards(AuthGuard, RbacGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles('admin')
  async getLogs(
    @Param('orgId') orgId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '25'
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 25;
    return this.auditLogsService.getLogs(orgId, pageNum, limitNum);
  }
}
