import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token not found');
    }

    try {
      const userId = this.authService.verifySessionToken(token);
      
      const user = await this.prisma.client.user.findUnique({
        where: { id: userId },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException('User no longer exists');
      }

      // Attach user to request
      request.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
        memberships: user.memberships,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired authentication session');
    }
  }

  private extractToken(request: any): string | null {
    // 1. Check cookies (whatsai_session)
    if (request.cookies?.whatsai_session) {
      return request.cookies.whatsai_session;
    }

    // 2. Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}
