import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto, MfaDisableDto } from './dto/mfa.dto';
import { AuthGuard } from './auth.guard';

@Controller('api')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setSessionCookie(res: Response, token: string) {
    res.cookie('whatsai_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  @Post('auth/signup')
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('auth/verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const result = await this.authService.login(dto);
    
    if ('token' in result && result.token) {
      this.setSessionCookie(res, result.token);
      return {
        message: 'Login successful',
        user: result.user,
      };
    }
    
    return result; // returns { mfaRequired: true, userId }
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: any) {
    res.clearCookie('whatsai_session');
    return { message: 'Logged out successfully' };
  }

  @Post('auth/forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('auth/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body('token') token: string, @Body('password') newPassword: string) {
    return this.authService.resetPassword(token, newPassword);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async getProfile(@Req() req: any) {
    return {
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        isPlatformAdmin: req.user.isPlatformAdmin,
        organizations: req.user.memberships.map((m: any) => ({
          id: m.organization.id,
          name: m.organization.name,
          role: m.role,
        })),
      },
    };
  }

  @UseGuards(AuthGuard)
  @Post('auth/mfa/enroll')
  async enrollMfa(@Req() req: any) {
    return this.authService.enrollMfa(req.user.id);
  }

  @UseGuards(AuthGuard)
  @Post('auth/mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(@Req() req: any, @Body() dto: MfaVerifyDto) {
    return this.authService.verifyAndEnableMfa(req.user.id, dto.code);
  }

  @UseGuards(AuthGuard)
  @Post('auth/mfa/disable')
  @HttpCode(HttpStatus.OK)
  async disableMfa(@Req() req: any, @Body() dto: MfaDisableDto) {
    return this.authService.disableMfa(req.user.id, dto.code);
  }
}
