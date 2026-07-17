import { IsNotEmpty, IsString } from 'class-validator';

export class ConnectWhatsappDto {
  @IsString()
  @IsNotEmpty()
  phoneNumberId!: string;

  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @IsString()
  @IsNotEmpty()
  metaBusinessAccountId!: string;

  @IsString()
  @IsNotEmpty()
  whatsappBusinessAccountId!: string;
}
