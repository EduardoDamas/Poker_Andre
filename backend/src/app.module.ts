import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { WalletModule } from './wallet/wallet.module';
import { WalletHttpModule } from './wallet/wallet-http.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminModule } from './admin/admin.module';
import { TablesModule } from './tables/tables.module';
import { TournamentModule } from './tournament/tournament.module';
import { PaymentsModule } from './payments/payments.module';
import { HealthController } from './health.controller';
import { DownloadController } from './download.controller';
import { LegalController } from './legal.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    WalletModule,
    WalletHttpModule,
    AuthModule,
    RealtimeModule,
    AdminModule,
    TablesModule,
    TournamentModule,
    PaymentsModule,
  ],
  controllers: [HealthController, DownloadController, LegalController],
  providers: [
    // Same validation everywhere (prod and e2e tests) — strips unknown fields,
    // transforms payloads, rejects extras.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class AppModule {}
