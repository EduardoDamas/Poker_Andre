import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    // Confirms the process is up and the database is reachable.
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'capa-contest-backend', db: 'reachable' };
  }
}
