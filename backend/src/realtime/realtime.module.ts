import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { TournamentModule } from '../tournament/tournament.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GameGateway } from './game.gateway';
import { TableService } from './table.service';
import { MultiTableTournamentManager } from '../tournament/multi-table-manager';

@Module({
  imports: [AuthModule, WalletModule, TournamentModule, NotificationsModule],
  providers: [GameGateway, TableService, MultiTableTournamentManager],
  exports: [TableService], // lobby reads live seat counts
})
export class RealtimeModule {}
