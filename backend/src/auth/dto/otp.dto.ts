import { IsString, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone!: string;
}

export class VerifyOtpDto {
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be 6 digits' })
  code!: string;
}
