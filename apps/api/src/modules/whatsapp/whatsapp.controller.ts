import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { ConnectWhatsappDto } from './dto/connect-whatsapp.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller()
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Post('api/organizations/:orgId/whatsapp-accounts')
  async connectAccount(@Param('orgId') orgId: string, @Body() dto: ConnectWhatsappDto) {
    return this.whatsappService.connectAccount(orgId, dto);
  }

  @UseGuards(AuthGuard, RbacGuard)
  @Get('api/organizations/:orgId/whatsapp-accounts')
  async getAccounts(@Param('orgId') orgId: string) {
    return this.whatsappService.getAccounts(orgId);
  }

  @Roles('owner')
  @UseGuards(AuthGuard, RbacGuard)
  @Delete('api/organizations/:orgId/whatsapp-accounts/:accountId')
  async disconnectAccount(
    @Param('orgId') orgId: string,
    @Param('accountId') accountId: string
  ) {
    return this.whatsappService.disconnectAccount(orgId, accountId);
  }

  // Meta Webhook validation (GET)
  @Get('webhooks/meta/whatsapp')
  verifyWebhook(@Query() query: any) {
    return this.whatsappService.verifyWebhook(query);
  }

  // Meta Webhook event (POST)
  @Post('webhooks/meta/whatsapp')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: any,
    @Headers('x-hub-signature-256') signature: string,
    @Body() payload: any
  ) {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(payload);
    return this.whatsappService.handleWebhookPayload(rawBody, signature, payload);
  }
}
