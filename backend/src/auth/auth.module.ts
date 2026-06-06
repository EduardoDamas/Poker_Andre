import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WalletModule } from '../wallet/wallet.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './otp/otp.service';
import { DevOtpProvider } from './otp/otp-provider';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    WalletModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-insecure-secret',
        // expiresIn accepts a vercel/ms string ("7d"); cast to satisfy the types.
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as `${number}d`,
        },
      }),
    }),
  ],
  providers: [AuthService, OtpService, DevOtpProvider, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, OtpService, DevOtpProvider, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
