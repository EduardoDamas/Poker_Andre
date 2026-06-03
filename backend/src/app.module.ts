import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { WalletModule } from './wallet/wallet.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    WalletModule,
    // Feature modules added as they are built:
    //   AuthModule, PokerModule (engine + gateway), AdminModule
  ],
  controllers: [HealthController],
})
export class AppModule {}
