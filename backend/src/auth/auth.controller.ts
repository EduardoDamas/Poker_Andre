import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService, PublicUser } from './auth.service';
import { OtpService, AuthToken } from './otp/otp.service';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.auth.register(dto);
  }

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ message: string }> {
    await this.otp.request(dto.phone);
    return { message: 'If the number is valid, a code has been sent.' };
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthToken> {
    return this.otp.verify(dto.phone, dto.code);
  }
}
