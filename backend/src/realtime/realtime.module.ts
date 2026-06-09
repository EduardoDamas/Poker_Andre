import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { TournamentModule } from '../tournament/tournament.module';
import { GameGateway } from './game.gateway';
import { TableService } from './table.service';

@Module({
  imports: [AuthModule, WalletModule, TournamentModule], // JwtService + Settlement + Tournament
  providers: [GameGateway, TableService],
  exports: [TableService], // lobby reads live seat counts
})
export class RealtimeModule {}
