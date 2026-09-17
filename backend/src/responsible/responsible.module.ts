import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlayerLimitService } from './player-limit.service';

/**
 * Responsible-gaming rules (deposit ceilings + self-exclusion). Service only —
 * WalletModule and the gateway depend on it, and AuthModule depends on
 * WalletModule, so importing AuthModule here would close a circle. The HTTP
 * endpoints live in ResponsibleHttpModule, mirroring WalletModule/WalletHttpModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [PlayerLimitService],
  exports: [PlayerLimitService],
})
export class ResponsibleModule {}
