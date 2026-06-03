import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { WithdrawalService } from './withdrawal.service';
import { SettlementService } from './settlement.service';

@Module({
  providers: [LedgerService, WalletService, WithdrawalService, SettlementService],
  exports: [LedgerService, WalletService, WithdrawalService, SettlementService],
})
export class WalletModule {}
