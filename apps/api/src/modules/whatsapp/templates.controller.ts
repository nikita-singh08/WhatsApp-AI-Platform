import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/organizations/:orgId/templates')
@UseGuards(AuthGuard, RbacGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @Roles('owner', 'admin')
  async create(
    @Param('orgId') orgId: string,
    @Body('whatsappAccountId') whatsappAccountId: string,
    @Body() data: any
  ) {
    return this.templatesService.create(orgId, whatsappAccountId, data);
  }

  @Get()
  @Roles('admin', 'operator', 'readonly')
  async findAll(@Param('orgId') orgId: string) {
    return this.templatesService.findAll(orgId);
  }

  @Get(':id')
  @Roles('admin', 'operator', 'readonly')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string
  ) {
    return this.templatesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() data: any
  ) {
    return this.templatesService.update(orgId, id, data);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(
    @Param('orgId') orgId: string,
    @Param('id') id: string
  ) {
    return this.templatesService.remove(orgId, id);
  }

  @Post(':id/submit')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('orgId') orgId: string,
    @Param('id') id: string
  ) {
    return this.templatesService.submitToMeta(orgId, id);
  }

  @Post(':id/send')
  @Roles('admin', 'operator')
  @HttpCode(HttpStatus.OK)
  async send(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body('recipientWaId') recipientWaId: string,
    @Body('variables') variables: any[]
  ) {
    return this.templatesService.sendTemplate(orgId, id, recipientWaId, variables);
  }
}
