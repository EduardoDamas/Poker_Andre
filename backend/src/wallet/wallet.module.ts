import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { WithdrawalService } from './withdrawal.service';

@Module({
  providers: [LedgerService, WalletService, WithdrawalService],
  exports: [LedgerService, WalletService, WithdrawalService],
})
export class WalletModule {}
