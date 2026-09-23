import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { PromoService } from './promo.service';
import { PromoBrackets } from './promo-bracket';

@Module({
  imports: [PrismaModule, WalletModule],
  // PromoBrackets: live bracket state, shared by the gateway and the lobby.
  providers: [PromoService, PromoBrackets],
  exports: [PromoService, PromoBrackets],
})
export class PromoModule {}
