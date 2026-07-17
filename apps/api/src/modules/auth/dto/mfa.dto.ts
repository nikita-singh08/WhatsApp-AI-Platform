import { IsNotEmpty, IsString, Length } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'MFA code must be exactly 6 characters' })
  code!: string;
}

export class MfaDisableDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'MFA code must be exactly 6 characters' })
  code!: string;
}
