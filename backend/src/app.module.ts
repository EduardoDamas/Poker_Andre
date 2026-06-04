import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { WalletModule } from './wallet/wallet.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminModule } from './admin/admin.module';
import { TablesModule } from './tables/tables.module';
import { HealthController } from './health.controller';
import { DownloadController } from './download.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    WalletModule,
    AuthModule,
    RealtimeModule,
    AdminModule,
    TablesModule,
  ],
  controllers: [HealthController, DownloadController],
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
