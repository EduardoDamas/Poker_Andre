import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from './wallet.module';
import { WalletController } from './wallet.controller';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Player-facing wallet HTTP endpoints. Kept separate from WalletModule so the
 * AuthModule (which depends on WalletModule) doesn't form a circular import.
 */
@Module({
  imports: [AuthModule, WalletModule, NotificationsModule],
  controllers: [WalletController],
})
export class WalletHttpModule {}
