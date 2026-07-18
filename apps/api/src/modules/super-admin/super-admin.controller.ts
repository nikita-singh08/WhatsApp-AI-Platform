import { Controller, Get, Post, Body, Param, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';

@Controller('api/admin')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('organizations')
  async getTelemetry() {
    return this.superAdminService.getOrganizationsTelemetry();
  }

  @Post('organizations/:orgId/suspend')
  async suspendOrg(@Param('orgId') orgId: string, @Req() req: any) {
    return this.superAdminService.suspendOrganization(orgId, req.user.id);
  }

  @Post('organizations/:orgId/unsuspend')
  async unsuspendOrg(@Param('orgId') orgId: string, @Req() req: any) {
    return this.superAdminService.unsuspendOrganization(orgId, req.user.id);
  }

  @Post('organizations/:orgId/feature-flags')
  async toggleFeature(
    @Param('orgId') orgId: string,
    @Body('key') key: string,
    @Body('enabled') enabled: boolean,
    @Req() req: any
  ) {
    if (!key || enabled === undefined) {
      throw new BadRequestException('Feature flag key and enabled toggle values are required.');
    }
    return this.superAdminService.toggleFeatureFlag(orgId, key, enabled, req.user.id);
  }

  @Post('impersonate')
  async impersonate(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Body('targetUserId') targetUserId: string
  ) {
    if (!targetUserId) {
      throw new BadRequestException('Target user identifier parameter is required.');
    }
    const result = await this.superAdminService.impersonateUser(req.user.id, targetUserId);
    
    res.cookie('whatsai_session', result.sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 2 * 60 * 60 * 1000,
    });

    return result;
  }
}
