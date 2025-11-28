import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';

@Module({
  providers: [IngestionService], // IngestionService를 이 모듈의 Provider로 등록
  exports: [IngestionService], // 외부(AppController 등)에서 주입하여 사용할 수 있도록 Export
})
export class IngestionModule {}
