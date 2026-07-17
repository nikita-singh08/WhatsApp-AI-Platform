import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@whatsai/shared';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false; // AuthGuard must run before RbacGuard
    }

    // Extract organizationId from request (supports orgId or organizationId in params, query, or body)
    const organizationId =
      request.params.organizationId ||
      request.params.orgId ||
      request.query.organizationId ||
      request.body.organizationId;

    if (!organizationId) {
      // If endpoint is not org-scoped (e.g. user profile /admin pages), bypass RbacGuard
      // Admin endpoints check platform admin flag separately
      return true;
    }

    // Find user's membership in the target organization
    const membership = user.memberships?.find(
      (m: any) => m.organizationId === organizationId && m.status === 'active'
    );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    // Store resolved membership on the request for downstream controllers/services to access
    request.organizationMember = membership;

    // If no specific roles are required, just membership is enough (tenant isolation check)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const hasRole = requiredRoles.includes(membership.role as UserRole);
    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions in this organization');
    }

    return true;
  }
}
