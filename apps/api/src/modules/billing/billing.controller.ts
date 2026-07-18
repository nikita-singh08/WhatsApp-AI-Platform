import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Headers,
  Req,
  Res,
  HttpStatus,
  UseGuards,
  RawBodyRequest,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/organizations/:orgId/billing')
@UseGuards(AuthGuard, RbacGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @Roles('admin')
  async startCheckout(
    @Param('orgId') orgId: string,
    @Body('plan') plan: string,
    @Body('interval') interval: 'monthly' | 'yearly' = 'monthly'
  ) {
    return this.billingService.createCheckoutSession(orgId, plan, interval);
  }

  @Post('portal')
  @Roles('admin')
  async startPortal(@Param('orgId') orgId: string) {
    return this.billingService.createPortalSession(orgId);
  }

  @Get('usage')
  @Roles('readonly')
  async getUsage(@Param('orgId') orgId: string) {
    return this.billingService.getUsageStats(orgId);
  }

  @Get('cost')
  @Roles('readonly')
  async getCost(@Param('orgId') orgId: string) {
    return this.billingService.getCostStats(orgId);
  }

  @Patch('cost-cap')
  @Roles('admin', 'owner')
  async updateCostCap(
    @Param('orgId') orgId: string,
    @Body('costCapCents') costCapCents: number
  ) {
    if (costCapCents === undefined || costCapCents < 0) {
      throw new BadRequestException('Valid daily cost cap value is required.');
    }
    return this.billingService.updateDailyCostCap(orgId, costCapCents);
  }
}

@Controller('api/webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: any,
    @Res() res: any
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      return res.status(HttpStatus.BAD_REQUEST).send('Missing raw request body needed for signature verification.');
    }

    try {
      await this.billingService.handleWebhook(signature, rawBody);
      res.status(HttpStatus.OK).send({ received: true });
    } catch (err: any) {
      res.status(HttpStatus.BAD_REQUEST).send(err.message || 'Webhook consumption error');
    }
  }
}
