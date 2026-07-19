import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/organizations/:orgId/integrations')
@UseGuards(AuthGuard, RbacGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post(':provider')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  async connect(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
    @Body('credentials') credentials: any,
    @Body('config') config?: any
  ) {
    return this.integrationsService.connectIntegration(orgId, provider, credentials, config);
  }

  @Delete(':provider')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string
  ) {
    return this.integrationsService.disconnectIntegration(orgId, provider);
  }

  @Get(':provider')
  @Roles('admin', 'operator', 'readonly')
  async getStatus(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string
  ) {
    return this.integrationsService.getIntegration(orgId, provider);
  }

  @Get()
  @Roles('admin', 'operator', 'readonly')
  async list(@Param('orgId') orgId: string) {
    return this.integrationsService.listIntegrations(orgId);
  }
}
