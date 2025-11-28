import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { IngestionService } from './ingestion/ingestion.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly ingestionService: IngestionService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ingest')
  async ingestDocuments(): Promise<string> {
    console.log('--- API Call: Starting Document Ingestion ---');
    return this.ingestionService.runIngestion();
  }
}
