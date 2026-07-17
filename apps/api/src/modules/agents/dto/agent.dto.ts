import { IsNotEmpty, IsString, IsOptional, IsEnum, IsBoolean, IsJSON } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  type!: string; // support, sales, booking, billing, faq, custom

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  systemPrompt!: string;

  @IsString()
  @IsOptional()
  tone?: string;

  @IsString()
  @IsOptional()
  language?: string;
}

export class UpdateAgentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  tone?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsOptional()
  businessRules?: any;

  @IsOptional()
  escalationConfig?: any;

  @IsBoolean()
  @IsOptional()
  strictKnowledgeMode?: boolean;

  @IsString()
  @IsOptional()
  fallbackMessage?: string;

  @IsBoolean()
  @IsOptional()
  humanEscalationEnabled?: boolean;

  @IsOptional()
  workingHours?: any;

  @IsString()
  @IsOptional()
  outsideHoursMode?: string;

  @IsString()
  @IsOptional()
  outsideHoursMessage?: string;

  @IsBoolean()
  @IsOptional()
  aiDisclosureEnabled?: boolean;

  @IsString()
  @IsOptional()
  aiDisclosureMessage?: string;

  @IsOptional()
  allowedTools?: any;

  @IsString()
  @IsOptional()
  status?: string;
}
