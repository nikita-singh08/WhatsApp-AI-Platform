import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto, UpdateOrganizationDto, InviteMemberDto, UpdateMemberDto } from './dto/organization.dto';
import * as crypto from 'crypto';
import { NotificationDispatcher } from '@whatsai/notifications';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Create Organization Workspace
   */
  async create(userId: string, userEmail: string, dto: CreateOrganizationDto) {
    // 1. Enforce max 3 organizations per user across the platform
    await this.billingService.checkUserOrgsLimit(userId);

    // 2. Enforce 1 free-tier organization per email domain (anti-abuse)
    const emailDomain = userEmail.split('@')[1];
    const domainConflict = await this.prisma.client.organization.findFirst({
      where: {
        status: 'active',
        members: {
          some: {
            user: {
              email: { endsWith: `@${emailDomain}` },
            },
            role: 'owner',
          },
        },
        subscription: {
          plan: 'free',
        },
      },
    });

    if (domainConflict) {
      throw new BadRequestException(`An organization on the free tier already exists for the domain: ${emailDomain}`);
    }

    // Generate slug if not provided
    const slug = dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check slug uniqueness
    const slugConflict = await this.prisma.client.organization.findUnique({
      where: { slug },
    });

    if (slugConflict) {
      throw new BadRequestException('Organization slug is already taken. Please choose a different slug.');
    }

    // Create organization transaction
    const org = await this.prisma.client.$transaction(async (tx) => {
      // 1. Create Organization
      const newOrg = await tx.organization.create({
        data: {
          name: dto.name,
          slug,
          timezone: dto.timezone || 'UTC',
          defaultLanguage: dto.defaultLanguage || 'en',
          status: 'active',
        },
      });

      // 2. Create Owner Membership
      await tx.organizationMember.create({
        data: {
          organizationId: newOrg.id,
          userId,
          role: 'owner',
          billingAccess: true,
          status: 'active',
        },
      });

      // 3. Create Default Onboarding checklist progress
      await tx.onboardingProgress.create({
        data: {
          organizationId: newOrg.id,
          whatsappConnected: false,
          agentCreated: false,
          knowledgeUploaded: false,
          firstAiReply: false,
          billingConfigured: false,
        },
      });

      // 4. Create Free tier subscription mapping
      await tx.subscription.create({
        data: {
          organizationId: newOrg.id,
          plan: 'free',
          status: 'active',
        },
      });

      return newOrg;
    });

    return org;
  }

  /**
   * Find Organization Details
   */
  async findOne(orgId: string) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
      include: {
        subscription: true,
        onboardingProgress: true,
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  /**
   * Update Organization Details
   */
  async update(orgId: string, dto: UpdateOrganizationDto) {
    return this.prisma.client.organization.update({
      where: { id: orgId },
      data: {
        name: dto.name,
        slug: dto.slug,
        timezone: dto.timezone,
        defaultLanguage: dto.defaultLanguage,
        memoryEnabled: dto.memoryEnabled,
      },
    });
  }

  /**
   * List Organization Members
   */
  async getMembers(orgId: string) {
    return this.prisma.client.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            emailVerifiedAt: true,
          },
        },
      },
    });
  }

  /**
   * Update Member Role/Billing Access
   */
  async updateMember(orgId: string, memberId: string, dto: UpdateMemberDto) {
    const member = await this.prisma.client.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== orgId) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (member.role === 'owner') {
      throw new BadRequestException('Cannot modify the role of the organization owner. Use the transfer-ownership route.');
    }

    return this.prisma.client.organizationMember.update({
      where: { id: memberId },
      data: {
        role: dto.role,
        billingAccess: dto.billingAccess,
      },
    });
  }

  /**
   * Remove Member from Organization
   */
  async removeMember(orgId: string, memberId: string) {
    const member = await this.prisma.client.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== orgId) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (member.role === 'owner') {
      throw new BadRequestException('The owner cannot be removed from the organization.');
    }

    await this.prisma.client.organizationMember.delete({
      where: { id: memberId },
    });

    return { message: 'Member removed successfully' };
  }

  /**
   * Invite a Team Member
   */
  async invite(orgId: string, invitedByUserId: string, dto: InviteMemberDto) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Check if the user is already a member
    const existingMember = await this.prisma.client.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        user: { email: dto.email },
      },
    });

    if (existingMember) {
      throw new BadRequestException('User is already a member of this organization');
    }

    // Check for existing pending invitation
    const existingInvite = await this.prisma.client.invitation.findFirst({
      where: {
        organizationId: orgId,
        email: dto.email,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      throw new BadRequestException('A pending invitation has already been sent to this email');
    }

    // Enforce seats limit
    await this.billingService.checkOrgSeatsLimit(orgId);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await this.prisma.client.invitation.create({
      data: {
        organizationId: orgId,
        invitedByUserId,
        email: dto.email,
        role: dto.role,
        token,
        expiresAt,
        status: 'pending',
      },
    });

    const inviteLink = `${process.env.APP_URL || 'http://localhost:3000'}/accept-invite?token=${token}`;

    // Send mock invitation email
    await NotificationDispatcher.sendEmail({
      to: dto.email,
      subject: `You've been invited to join ${org.name} - WhatsAI`,
      body: `Hi,\n\nYou have been invited to join ${org.name} as an ${dto.role} on the WhatsAI platform.\n\nAccept the invitation by clicking the link below:\n${inviteLink}\n\nThis invitation will expire in 7 days.`,
    });

    return {
      message: 'Invitation sent successfully',
      invitationId: invitation.id,
    };
  }

  /**
   * List Pending Invitations
   */
  async getInvitations(orgId: string) {
    return this.prisma.client.invitation.findMany({
      where: {
        organizationId: orgId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });
  }

  /**
   * Cancel Invitation
   */
  async cancelInvitation(orgId: string, invitationId: string) {
    const invite = await this.prisma.client.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invite || invite.organizationId !== orgId) {
      throw new NotFoundException('Invitation not found in this organization');
    }

    await this.prisma.client.invitation.update({
      where: { id: invitationId },
      data: { status: 'cancelled' },
    });

    return { message: 'Invitation cancelled successfully' };
  }

  /**
   * Accept Invitation
   */
  async acceptInvitation(token: string, userId: string) {
    const invite = await this.prisma.client.invitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invite || invite.status !== 'pending' || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.email !== invite.email) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    // Add user as member
    await this.prisma.client.$transaction([
      this.prisma.client.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          userId,
          role: invite.role,
          billingAccess: false,
          status: 'active',
        },
      }),
      this.prisma.client.invitation.update({
        where: { id: invite.id },
        data: { status: 'accepted' },
      }),
    ]);

    return {
      message: 'Invitation accepted successfully',
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
        role: invite.role,
      },
    };
  }

  /**
   * Transfer Organization Ownership to another member
   */
  async transferOwnership(orgId: string, actorUserId: string, newOwnerMemberId: string) {
    const currentOwner = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: orgId, role: 'owner', userId: actorUserId },
    });

    if (!currentOwner) {
      throw new ForbiddenException('Only the current organization owner can transfer ownership.');
    }

    const targetMember = await this.prisma.client.organizationMember.findUnique({
      where: { id: newOwnerMemberId },
    });

    if (!targetMember || targetMember.organizationId !== orgId) {
      throw new NotFoundException('Target new owner member not found in this organization.');
    }

    await this.prisma.client.$transaction([
      this.prisma.client.organizationMember.update({
        where: { id: currentOwner.id },
        data: { role: 'admin' },
      }),
      this.prisma.client.organizationMember.update({
        where: { id: targetMember.id },
        data: { role: 'owner' },
      }),
    ]);

    // Audit log
    await this.prisma.client.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'organization.ownership.transfer',
        resourceType: 'organization',
        resourceId: orgId,
        metadata: {
          previousOwnerMemberId: currentOwner.id,
          newOwnerMemberId,
        },
      },
    });

    return { message: 'Ownership transferred successfully' };
  }

  /**
   * Schedule organization deletion (suspends and starts 30-day grace period)
   */
  async scheduleDeletion(orgId: string, actorUserId: string) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const gracePeriodDate = new Date();
    gracePeriodDate.setDate(gracePeriodDate.getDate() + 30);

    const updated = await this.prisma.client.organization.update({
      where: { id: orgId },
      data: {
        status: 'suspended',
        deletionScheduledAt: gracePeriodDate,
      },
    });

    // Audit log
    await this.prisma.client.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'organization.deletion.scheduled',
        resourceType: 'organization',
        resourceId: orgId,
        metadata: { deletionScheduledAt: gracePeriodDate },
      },
    });

    return updated;
  }

  /**
   * Cancel scheduled organization deletion and reactivate
   */
  async cancelDeletion(orgId: string, actorUserId: string) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.client.organization.update({
      where: { id: orgId },
      data: {
        status: 'active',
        deletionScheduledAt: null,
      },
    });

    // Audit log
    await this.prisma.client.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'organization.deletion.cancelled',
        resourceType: 'organization',
        resourceId: orgId,
      },
    });

    return updated;
  }
}
