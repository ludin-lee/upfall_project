import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestionService } from './ingestion/ingestion.service';
import { IngestionModule } from './ingestion/ingestion.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [IngestionModule, ChatModule],
  controllers: [AppController],
  providers: [AppService, IngestionService],
})
export class AppModule {}
