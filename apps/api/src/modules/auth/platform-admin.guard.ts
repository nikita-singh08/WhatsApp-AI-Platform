import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.user || !request.user.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator privileges required.');
    }
    return true;
  }
}
