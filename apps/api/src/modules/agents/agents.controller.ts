import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Post('organizations/:orgId/agents')
  async create(
    @Param('orgId') orgId: string,
    @Req() req: any,
    @Body() dto: CreateAgentDto
  ) {
    return this.agentsService.create(orgId, req.user.id, dto);
  }

  @UseGuards(AuthGuard, RbacGuard)
  @Get('organizations/:orgId/agents')
  async findAll(@Param('orgId') orgId: string) {
    return this.agentsService.findAll(orgId);
  }

  @UseGuards(AuthGuard, RbacGuard)
  @Get('organizations/:orgId/agents/:agentId')
  async findOne(@Param('orgId') orgId: string, @Param('agentId') agentId: string) {
    return this.agentsService.findOne(orgId, agentId);
  }

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Patch('organizations/:orgId/agents/:agentId')
  async update(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Req() req: any,
    @Body() dto: UpdateAgentDto
  ) {
    return this.agentsService.update(orgId, agentId, req.user.id, dto);
  }

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Post('organizations/:orgId/agents/:agentId/activate')
  @HttpCode(HttpStatus.OK)
  async activateAgent(
    @Param('orgId') orgId: string,
    @Param('agentId') agentId: string,
    @Body('whatsappAccountId') whatsappAccountId: string
  ) {
    return this.agentsService.activateAgent(orgId, agentId, whatsappAccountId);
  }

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Post('organizations/:orgId/agents/:agentId/archive')
  @HttpCode(HttpStatus.OK)
  async archiveAgent(@Param('orgId') orgId: string, @Param('agentId') agentId: string) {
    return this.agentsService.archiveAgent(orgId, agentId);
  }
}
