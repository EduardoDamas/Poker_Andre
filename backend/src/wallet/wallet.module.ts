import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { WithdrawalService } from './withdrawal.service';
import { DepositService } from './deposit.service';
import { SettlementService } from './settlement.service';
import { ReconciliationService } from './reconciliation.service';

@Module({
  providers: [
    LedgerService,
    WalletService,
    WithdrawalService,
    DepositService,
    SettlementService,
    ReconciliationService,
  ],
  exports: [
    LedgerService,
    WalletService,
    WithdrawalService,
    DepositService,
    SettlementService,
    ReconciliationService,
  ],
})
export class WalletModule {}
