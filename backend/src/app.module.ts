import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    // Feature modules added as they are built:
    //   AuthModule, WalletModule, PokerModule (engine + gateway), AdminModule
  ],
  controllers: [HealthController],
})
export class AppModule {}
