import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';

@Module({
  providers: [LedgerService, WalletService],
  exports: [LedgerService, WalletService],
})
export class WalletModule {}
