import { IsDateString, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  // E.164-ish: optional +, 10–15 digits.
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsString()
  @Length(2, 50)
  displayName!: string;

  // Accept formatted or raw; check-digit validation happens in the service.
  @IsString()
  cpf!: string;

  // ISO date string (e.g. "1990-01-01"); 18+ enforced in the service.
  @IsDateString()
  birthDate!: string;
}
