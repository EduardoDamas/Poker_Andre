import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { PromoService } from './promo.service';

@Module({
  imports: [PrismaModule, WalletModule],
  providers: [PromoService],
  exports: [PromoService],
})
export class PromoModule {}
