import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { ConversationsService } from './conversations.service';
import { ManualReplyDto } from './dto/conversations.dto';

@Controller('api/organizations/:orgId/conversations')
@UseGuards(AuthGuard, RbacGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @Roles('admin', 'operator', 'readonly')
  async getConversations(
    @Param('orgId') orgId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.conversationsService.findAll(orgId, pageNum, limitNum);
  }

  @Get(':convId/messages')
  @Roles('admin', 'operator', 'readonly')
  async getMessages(
    @Param('orgId') orgId: string,
    @Param('convId') convId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.conversationsService.findMessages(orgId, convId, pageNum, limitNum);
  }

  @Post(':convId/messages')
  @Roles('admin', 'operator')
  async sendManualReply(
    @Param('orgId') orgId: string,
    @Param('convId') convId: string,
    @Req() req: any,
    @Body() dto: ManualReplyDto,
  ) {
    const operatorUserId = req.user.id;
    return this.conversationsService.manualReply(orgId, convId, operatorUserId, dto.content);
  }

  @Post(':convId/takeover')
  @Roles('admin', 'operator')
  async startTakeover(
    @Param('orgId') orgId: string,
    @Param('convId') convId: string,
  ) {
    return this.conversationsService.toggleTakeover(orgId, convId, true);
  }

  @Post(':convId/handback')
  @Roles('admin', 'operator')
  async endTakeover(
    @Param('orgId') orgId: string,
    @Param('convId') convId: string,
  ) {
    return this.conversationsService.toggleTakeover(orgId, convId, false);
  }
}
