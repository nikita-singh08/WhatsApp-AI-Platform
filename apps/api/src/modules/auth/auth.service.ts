import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { encrypt, decrypt } from '@whatsai/integrations';
import { NotificationDispatcher } from '@whatsai/notifications';

@Injectable()
export class AuthService {
  private readonly jwtSecret = process.env.ENCRYPTION_KEY || 'default_jwt_secret_key';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to generate session token for a user
   */
  generateSessionToken(userId: string): string {
    return jwt.sign({ userId }, this.jwtSecret, { expiresIn: '24h' });
  }

  /**
   * Helper to verify session token and return user ID
   */
  verifySessionToken(token: string): string {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      return decoded.userId;
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  /**
   * User Signup
   */
  async signup(dto: SignupDto) {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('Email address already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        authProvider: 'email',
      },
    });

    // Generate email verification token (expires in 1 day)
    const verificationToken = jwt.sign(
      { userId: user.id, type: 'email-verification' },
      this.jwtSecret,
      { expiresIn: '1d' }
    );

    const verificationLink = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

    // Send mock verification email
    await NotificationDispatcher.sendEmail({
      to: user.email,
      subject: 'Verify your email address - WhatsAI',
      body: `Hi ${user.name},\n\nPlease verify your email by clicking the link below:\n${verificationLink}\n\nThis link will expire in 24 hours.`,
    });

    return {
      message: 'Registration successful. Verification email sent.',
      userId: user.id,
    };
  }

  /**
   * Verify Email Link
   */
  async verifyEmail(token: string) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string; type: string };
      
      if (decoded.type !== 'email-verification') {
        throw new BadRequestException('Invalid token type');
      }

      const user = await this.prisma.client.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      if (user.emailVerifiedAt) {
        return { message: 'Email already verified' };
      }

      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });

      return { message: 'Email verified successfully' };
    } catch (error) {
      throw new BadRequestException('Invalid or expired email verification link');
    }
  }

  /**
   * User Login
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
      include: { mfaMethods: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check account lockout status
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const waitTimeMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (1000 * 60));
      throw new UnauthorizedException(`Account locked due to multiple failed login attempts. Try again in ${waitTimeMinutes} minutes.`);
    }

    const passwordMatch = user.passwordHash
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : false;

    if (!passwordMatch) {
      await this.handleFailedLoginAttempt(user.id, user.loginAttempts);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset login attempts on success
    if (user.loginAttempts > 0) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { loginAttempts: 0, lockedUntil: null },
      });
    }

    // Check email verification
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Email verification is required before login.');
    }

    // Check MFA Methods
    const mfaEnabledMethod = user.mfaMethods.find((m) => m.method === 'totp' && m.isEnabled);
    
    if (mfaEnabledMethod) {
      if (!dto.mfaCode) {
        return { mfaRequired: true, userId: user.id };
      }

      const secret = decrypt(mfaEnabledMethod.secretEncrypted);
      const isMfaValid = authenticator.verify({
        token: dto.mfaCode,
        secret,
      });

      if (!isMfaValid) {
        throw new UnauthorizedException('Invalid MFA authentication code');
      }
    }

    // Create session token
    const token = this.generateSessionToken(user.id);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    };
  }

  private async handleFailedLoginAttempt(userId: string, currentAttempts: number) {
    const nextAttempts = currentAttempts + 1;
    let lockedUntil: Date | null = null;

    if (nextAttempts >= 10) {
      // Permanent lock (100 years / until email verification/unlock)
      lockedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
      console.log(`[Auth] User ${userId} reached 10 failed login attempts. Account locked permanently until email unlock.`);
    } else if (nextAttempts >= 5) {
      // 15-minute lock
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      console.log(`[Auth] User ${userId} reached 5 failed login attempts. Account locked for 15 minutes.`);
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        loginAttempts: nextAttempts,
        lockedUntil,
      },
    });
  }

  /**
   * Enroll MFA Secret (Returns QR code uri)
   */
  async enrollMfa(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const secret = authenticator.generateSecret();
    const encryptedSecret = encrypt(secret);

    // Save in user_mfa_methods (update if exists)
    await this.prisma.client.userMfaMethod.upsert({
      where: {
        userId_method: { userId, method: 'totp' },
      },
      create: {
        userId,
        method: 'totp',
        secretEncrypted: encryptedSecret,
        isEnabled: false,
      },
      update: {
        secretEncrypted: encryptedSecret,
        isEnabled: false,
        verifiedAt: null,
      },
    });

    const qrCodeUrl = authenticator.keyuri(
      user.email,
      'WhatsAI',
      secret
    );

    return {
      secret, // Provide raw secret for manual copy-paste
      qrCodeUrl,
    };
  }

  /**
   * Verify and Enable MFA
   */
  async verifyAndEnableMfa(userId: string, code: string) {
    const mfa = await this.prisma.client.userMfaMethod.findUnique({
      where: {
        userId_method: { userId, method: 'totp' },
      },
    });

    if (!mfa) {
      throw new BadRequestException('MFA has not been enrolled for this user');
    }

    const secret = decrypt(mfa.secretEncrypted);
    const isValid = authenticator.verify({
      token: code,
      secret,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.client.userMfaMethod.update({
      where: { id: mfa.id },
      data: {
        isEnabled: true,
        verifiedAt: new Date(),
      },
    });

    return { message: 'MFA enabled successfully' };
  }

  /**
   * Disable MFA
   */
  async disableMfa(userId: string, code: string) {
    const mfa = await this.prisma.client.userMfaMethod.findUnique({
      where: {
        userId_method: { userId, method: 'totp' },
      },
    });

    if (!mfa || !mfa.isEnabled) {
      throw new BadRequestException('MFA is not enabled for this user');
    }

    const secret = decrypt(mfa.secretEncrypted);
    const isValid = authenticator.verify({
      token: code,
      secret,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.client.userMfaMethod.delete({
      where: { id: mfa.id },
    });

    return { message: 'MFA disabled successfully' };
  }

  /**
   * Trigger Password Reset
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Avoid user enumeration - return success anyway
      return { message: 'If the email exists, a password reset link has been sent.' };
    }

    const token = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    const resetLink = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    await NotificationDispatcher.sendEmail({
      to: user.email,
      subject: 'Reset your password - WhatsAI',
      body: `Hi ${user.name},\n\nPlease reset your password by clicking the link below:\n${resetLink}\n\nThis link will expire in 1 hour.`,
    });

    return { message: 'If the email exists, a password reset link has been sent.' };
  }

  /**
   * Reset Password with token
   */
  async resetPassword(token: string, newPassword: string) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string; type: string };
      
      if (decoded.type !== 'password-reset') {
        throw new BadRequestException('Invalid token type');
      }

      const hash = await bcrypt.hash(newPassword, 10);

      await this.prisma.client.user.update({
        where: { id: decoded.userId },
        data: {
          passwordHash: hash,
          loginAttempts: 0,
          lockedUntil: null,
        },
      });

      return { message: 'Password reset successfully' };
    } catch (e) {
      throw new BadRequestException('Invalid or expired password reset link');
    }
  }
}
