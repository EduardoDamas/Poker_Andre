import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuditModule } from '../audit/audit.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [AuthModule, WalletModule, AuditModule], // auth + wallet + audit trail
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
})
export class AdminModule {}
