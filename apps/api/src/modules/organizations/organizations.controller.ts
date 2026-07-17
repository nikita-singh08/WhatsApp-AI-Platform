import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto, InviteMemberDto, UpdateMemberDto } from './dto/organization.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @UseGuards(AuthGuard)
  @Post('organizations')
  async create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(req.user.id, req.user.email, dto);
  }

  @UseGuards(AuthGuard)
  @Post('organizations/invitations/:token/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(@Param('token') token: string, @Req() req: any) {
    return this.organizationsService.acceptInvitation(token, req.user.id);
  }

  @UseGuards(AuthGuard, RbacGuard)
  @Get('organizations/:orgId')
  async findOne(@Param('orgId') orgId: string) {
    return this.organizationsService.findOne(orgId);
  }

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Patch('organizations/:orgId')
  async update(@Param('orgId') orgId: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(orgId, dto);
  }

  @UseGuards(AuthGuard, RbacGuard)
  @Get('organizations/:orgId/members')
  async getMembers(@Param('orgId') orgId: string) {
    return this.organizationsService.getMembers(orgId);
  }

  @Roles('owner')
  @UseGuards(AuthGuard, RbacGuard)
  @Patch('organizations/:orgId/members/:memberId')
  async updateMember(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto
  ) {
    return this.organizationsService.updateMember(orgId, memberId, dto);
  }

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Delete('organizations/:orgId/members/:memberId')
  async removeMember(@Param('orgId') orgId: string, @Param('memberId') memberId: string) {
    return this.organizationsService.removeMember(orgId, memberId);
  }

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Post('organizations/:orgId/invitations')
  async invite(
    @Param('orgId') orgId: string,
    @Req() req: any,
    @Body() dto: InviteMemberDto
  ) {
    return this.organizationsService.invite(orgId, req.user.id, dto);
  }

  @UseGuards(AuthGuard, RbacGuard)
  @Get('organizations/:orgId/invitations')
  async getInvitations(@Param('orgId') orgId: string) {
    return this.organizationsService.getInvitations(orgId);
  }

  @Roles('owner', 'admin')
  @UseGuards(AuthGuard, RbacGuard)
  @Delete('organizations/:orgId/invitations/:invitationId')
  async cancelInvitation(
    @Param('orgId') orgId: string,
    @Param('invitationId') invitationId: string
  ) {
    return this.organizationsService.cancelInvitation(orgId, invitationId);
  }
}
