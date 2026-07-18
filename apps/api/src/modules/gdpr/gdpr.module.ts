import { Module } from '@nestjs/common';
import { GDPRService } from './gdpr.service';
import { GDPRController } from './gdpr.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [GDPRController],
  providers: [GDPRService],
})
export class GDPRModule {}
