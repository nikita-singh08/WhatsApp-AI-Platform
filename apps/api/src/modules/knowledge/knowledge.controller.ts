import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { KnowledgeBaseService } from './knowledge.service';
import { CreateKnowledgeBaseDto, UploadDocumentDto } from './dto/knowledge.dto';

@Controller('api/organizations/:orgId/knowledge-bases')
@UseGuards(AuthGuard, RbacGuard)
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Post()
  @Roles('admin')
  async createBase(
    @Param('orgId') orgId: string,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.kbService.createKnowledgeBase(orgId, dto.name, dto.description);
  }

  @Get()
  @Roles('admin', 'operator', 'readonly')
  async getBases(@Param('orgId') orgId: string) {
    return this.kbService.findBases(orgId);
  }

  @Post(':kbId/documents')
  @Roles('admin')
  async uploadDoc(
    @Param('orgId') orgId: string,
    @Param('kbId') kbId: string,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.kbService.uploadDocument(orgId, kbId, dto.title, dto.content, dto.fileName);
  }

  @Get('query')
  @Roles('admin', 'operator')
  async queryKb(
    @Param('orgId') orgId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 3;
    return this.kbService.querySimilarity(orgId, query, limitNum);
  }
}
