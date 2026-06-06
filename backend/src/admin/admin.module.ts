import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuditModule } from '../audit/audit.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { OtpRelayController } from './otp-relay.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [AuthModule, WalletModule, AuditModule],
  providers: [AdminService, AdminGuard],
  controllers: [AdminController, OtpRelayController],
})
export class AdminModule {}
