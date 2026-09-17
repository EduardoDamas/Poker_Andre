import { IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be the 6-digit code you received' })
  code!: string;

  @IsString()
  @Length(6, 100)
  password!: string;
}
