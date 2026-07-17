import { IsEmail, IsNotEmpty, IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  defaultLanguage?: string;
}

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  defaultLanguage?: string;

  @IsBoolean()
  @IsOptional()
  memoryEnabled?: boolean;
}

export class InviteMemberDto {
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty()
  email!: string;

  @IsEnum(['admin', 'operator', 'readonly'], { message: 'Invalid role' })
  @IsNotEmpty()
  role!: 'admin' | 'operator' | 'readonly';
}

export class UpdateMemberDto {
  @IsEnum(['admin', 'operator', 'readonly'], { message: 'Invalid role' })
  @IsOptional()
  role?: 'admin' | 'operator' | 'readonly';

  @IsBoolean()
  @IsOptional()
  billingAccess?: boolean;
}
