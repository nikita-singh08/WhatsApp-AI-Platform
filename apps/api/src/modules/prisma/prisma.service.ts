import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@whatsai/database';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  // Expose prisma instance
  readonly client = prisma;

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
