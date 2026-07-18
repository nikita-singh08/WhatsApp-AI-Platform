import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { RbacGuard } from './rbac.guard';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RbacGuard, PlatformAdminGuard],
  exports: [AuthService, AuthGuard, RbacGuard, PlatformAdminGuard],
})
export class AuthModule {}
