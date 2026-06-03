import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { GameGateway } from './game.gateway';
import { TableService } from './table.service';

@Module({
  imports: [AuthModule, WalletModule], // JwtService + SettlementService
  providers: [GameGateway, TableService],
  exports: [TableService], // lobby reads live seat counts
})
export class RealtimeModule {}
