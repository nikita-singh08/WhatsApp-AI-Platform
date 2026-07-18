import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { AgentsModule } from './modules/agents/agents.module';
import { WebsocketsModule } from './modules/websockets/websockets.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { KnowledgeBaseModule } from './modules/knowledge/knowledge.module';
import { MemoryModule } from './modules/memory/memory.module';
import { BillingModule } from './modules/billing/billing.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { GDPRModule } from './modules/gdpr/gdpr.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    // Configure global config loader
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),

    // Configure global Throttler rate limiter: 100 requests per 15 minutes
    ThrottlerModule.forRoot([{
      ttl: 900000,
      limit: 100,
    }]),

    // Configure BullMQ background queues connected to Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
        
        // Parse Redis connection details
        try {
          const parsed = new URL(redisUrl);
          return {
            connection: {
              host: parsed.hostname || 'localhost',
              port: parseInt(parsed.port || '6379', 10),
              username: parsed.username || undefined,
              password: parsed.password || undefined,
            },
          };
        } catch (e) {
          return {
            connection: {
              host: 'localhost',
              port: 6379,
            },
          };
        }
      },
      inject: [ConfigService],
    }),

    PrismaModule,
    AuthModule,
    OrganizationsModule,
    WhatsappModule,
    AgentsModule,
    WebsocketsModule,
    ConversationsModule,
    KnowledgeBaseModule,
    MemoryModule,
    BillingModule,
    AuditLogsModule,
    NotificationsModule,
    SuperAdminModule,
    GDPRModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
