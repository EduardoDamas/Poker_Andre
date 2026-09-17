import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService, PublicUser } from './auth.service';
import { OtpService, AuthToken } from './otp/otp.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard, JwtPayload } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

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

  /** Password login (phone + password). Alternative to OTP for testing. */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthToken> {
    return this.auth.loginWithPassword(dto.phone, dto.password);
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

  /**
   * "Esqueci minha senha", step 1 — send a code. Always answers the same, so the
   * endpoint cannot be used to find out which numbers have accounts.
   */
  @Post('password/forgot')
  @HttpCode(200)
  async forgotPassword(@Body() dto: RequestOtpDto): Promise<{ message: string }> {
    await this.auth.requestPasswordReset(dto.phone);
    return { message: 'Se o número estiver cadastrado, enviamos um código.' };
  }

  /** Step 2 — the code sets a new password and logs the player in. */
  @Post('password/reset')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<AuthToken> {
    return this.auth.resetPassword(dto.phone, dto.code, dto.password);
  }

  // Protected: requires a valid JWT.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload): Promise<PublicUser> {
    return this.auth.me(user.sub);
  }
}
