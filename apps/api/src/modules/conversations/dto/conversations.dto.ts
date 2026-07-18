import { IsString, IsNotEmpty, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class ManualReplyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  content: string;
}

export class TakeoverDto {
  @IsBoolean()
  takeover: boolean;
}
