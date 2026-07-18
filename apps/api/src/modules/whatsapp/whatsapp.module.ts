import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { AuthModule } from '../auth/auth.module';
import { BullModule } from '@nestjs/bullmq';
import { MemoryModule } from '../memory/memory.module';
import { KnowledgeBaseModule } from '../knowledge/knowledge.module';
import { IncomingMessageConsumer } from './incoming-message.consumer';
import { BillingModule } from '../billing/billing.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    AuthModule,
    MemoryModule,
    KnowledgeBaseModule,
    BillingModule,
    ConversationsModule,
    BullModule.registerQueue({
      name: 'incoming-message',
    }),
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, IncomingMessageConsumer],
  exports: [WhatsappService],
})
export class WhatsappModule {}
