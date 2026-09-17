import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResponsibleModule } from './responsible.module';
import { PlayerLimitController } from './player-limit.controller';

/**
 * Player-facing responsible-gaming endpoints. Separate from ResponsibleModule
 * so the AuthModule → WalletModule → ResponsibleModule chain stays acyclic.
 */
@Module({
  imports: [AuthModule, ResponsibleModule],
  controllers: [PlayerLimitController],
})
export class ResponsibleHttpModule {}
