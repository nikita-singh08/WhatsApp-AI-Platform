import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateKnowledgeBaseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UploadDocumentDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string; // Plain-text or Markdown content submitted directly

  @IsString()
  @IsOptional()
  fileName?: string;
}
