import { IsBoolean, IsDateString, IsOptional, IsString, Length, Matches } from 'class-validator';

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

  // Optional password (min 6). When set, the user can log in with phone+password
  // in addition to OTP. Used for testing before OTP delivery is live.
  @IsOptional()
  @IsString()
  @Length(6, 100)
  password?: string;

  /**
   * True when the player ticked "Li e aceito os Termos de Uso e a Política de
   * Privacidade". Optional on the wire so apps already installed (1.0.6 and
   * older, which have no checkbox) keep working — they simply record no
   * consent. Make it required once those versions are retired.
   */
  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;
}
