import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { GDPRService } from './gdpr.service';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/organizations/:orgId/gdpr')
@UseGuards(AuthGuard, RbacGuard)
export class GDPRController {
  constructor(private readonly gdprService: GDPRService) {}

  @Get('export/:contactId')
  @Roles('admin', 'owner')
  async exportDSAR(@Param('orgId') orgId: string, @Param('contactId') contactId: string) {
    return this.gdprService.compileDSAR(orgId, contactId);
  }

  @Delete('memory/:factId')
  @Roles('admin', 'owner')
  async deleteMemory(@Param('orgId') orgId: string, @Param('factId') factId: string) {
    return this.gdprService.deleteMemoryFact(orgId, factId);
  }
}
