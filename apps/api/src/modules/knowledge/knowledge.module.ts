import { Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge.service';
import { KnowledgeBaseController } from './knowledge.controller';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
