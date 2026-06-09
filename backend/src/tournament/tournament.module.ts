import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { TournamentService } from './tournament.service';

@Module({
  imports: [WalletModule], // LedgerService + WalletService
  providers: [TournamentService],
  exports: [TournamentService],
})
export class TournamentModule {}
