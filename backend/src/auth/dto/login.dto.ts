import { IsString, Length, Matches } from 'class-validator';

/** Password login: phone + password. */
export class LoginDto {
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsString()
  @Length(1, 100)
  password!: string;
}
