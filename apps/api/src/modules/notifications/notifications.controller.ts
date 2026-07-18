import { Controller, Get, Patch, Body, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/organizations/:orgId/notifications')
@UseGuards(AuthGuard, RbacGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  @Roles('readonly', 'operator', 'admin', 'owner')
  async getPreferences(@Param('orgId') orgId: string, @Req() req: any) {
    return this.notificationsService.getPreferences(orgId, req.user.id);
  }

  @Patch('preferences')
  @Roles('readonly', 'operator', 'admin', 'owner')
  async updatePreference(
    @Param('orgId') orgId: string,
    @Req() req: any,
    @Body('type') type: string,
    @Body('channel') channel: string
  ) {
    if (!type || !channel) {
      throw new BadRequestException('Notification alert type and channel parameters are required.');
    }
    try {
      return await this.notificationsService.updatePreference(orgId, req.user.id, type, channel);
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Failed to save preference details.');
    }
  }
}
