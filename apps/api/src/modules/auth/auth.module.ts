import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { RbacGuard } from './rbac.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RbacGuard],
  exports: [AuthService, AuthGuard, RbacGuard],
})
export class AuthModule {}
