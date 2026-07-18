import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AuthModule } from '../auth/auth.module';
import { MemoryModule } from '../memory/memory.module';
import { KnowledgeBaseModule } from '../knowledge/knowledge.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AuthModule, MemoryModule, KnowledgeBaseModule, BillingModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
