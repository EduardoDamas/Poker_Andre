import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WalletModule } from '../wallet/wallet.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './otp/otp.service';
import { DevOtpProvider, OTP_DELIVERY, OtpDelivery } from './otp/otp-provider';
import { TwilioOtpProvider } from './otp/twilio-otp-provider';
import { WhatsAppOtpProvider } from './otp/whatsapp-otp-provider';
import { JwtAuthGuard } from './jwt-auth.guard';

// Picks the OTP delivery channel from OTP_PROVIDER:
//   whatsapp -> Meta WhatsApp Cloud API (login codes over WhatsApp)
//   twilio   -> Twilio SMS
//   (unset/dev) -> dev logger, so local/e2e keep reading codes back
// A selected channel with missing creds fails loud rather than dropping codes.
const otpDeliveryProvider = {
  provide: OTP_DELIVERY,
  inject: [ConfigService, DevOtpProvider],
  useFactory: (config: ConfigService, dev: DevOtpProvider): OtpDelivery => {
    const provider = config.get<string>('OTP_PROVIDER');
    if (provider === 'whatsapp') {
      if (WhatsAppOtpProvider.isConfigured(config)) {
        return new WhatsAppOtpProvider(config);
      }
      throw new Error(
        'OTP_PROVIDER=whatsapp but WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_TOKEN/' +
          'WHATSAPP_OTP_TEMPLATE are not all set.',
      );
    }
    if (provider === 'twilio') {
      if (TwilioOtpProvider.isConfigured(config)) {
        return new TwilioOtpProvider(config);
      }
      throw new Error(
        'OTP_PROVIDER=twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN and a sender ' +
          '(TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM) are not all set.',
      );
    }
    return dev;
  },
};

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
  providers: [
    AuthService,
    OtpService,
    DevOtpProvider,
    otpDeliveryProvider,
    JwtAuthGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, OtpService, DevOtpProvider, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
