import { Injectable } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';

@Injectable()
export class IngestionService {
  // ChromaDB 컬렉션 이름 정의 (VectorDB의 테이블 이름과 유사)
  private readonly COLLECTION_NAME = 'test_collection_name';
  private readonly VECTOR_STORE_PATH = 'chroma_data'; // 로컬 저장 경로

  /**
   * 전체 인덱싱 파이프라인 실행
   */
  async runIngestion(): Promise<string> {
    console.log('--- RAG Ingestion Pipeline Started ---');

    const docs = await this.loadDocuments();
    const splitDocs = await this.splitDocuments(docs);
    await this.embedAndStore(splitDocs);

    return `✅ Ingestion Complete! ${splitDocs.length} chunks stored in ChromaDB at ${this.VECTOR_STORE_PATH}.`;
  }

  /**
   * 1단계: PDF 파일을 로드합니다.
   */
  private async loadDocuments(): Promise<Document[]> {
    console.log('1. Loading PDF documents...');

    // ⚠️ 참고: PDFLoader는 'pdf-parse' 같은 추가 라이브러리가 필요할 수 있습니다.
    // 만약 에러가 발생하면 'npm install pdf-parse'를 실행해야 합니다.

    // 여기에 PDF 파일 경로를 지정합니다.
    // 예시: documents 폴더에 있는 'assignment_guide.pdf'
    const pdfLoader = new PDFLoader('./documents/assignment_guide.pdf');

    const pdfDocs = await pdfLoader.load();
    console.log(`   -> Total ${pdfDocs.length} document pages loaded.`);

    return pdfDocs;
  }

  /**
   * 2단계: 긴 문서를 LLM Context에 맞게 청크로 분할합니다.
   */
  private async splitDocuments(docs: Document[]): Promise<Document[]> {
    console.log('2. Splitting documents...');
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000, // 청크 크기 (약 1000 토큰 내외)
      chunkOverlap: 200, // 청크 간 중복되는 글자 수 (검색 시 끊김 방지)
    });

    const splitDocs = await splitter.splitDocuments(docs);
    console.log(`   -> Split into ${splitDocs.length} chunks.`);
    return splitDocs;
  }
  /**
   * 3단계: 분할된 청크를 임베딩하고 ChromaDB에 저장합니다.
   */
  private async embedAndStore(docs: Document[]): Promise<void> {
    console.log('3. Creating embeddings and storing in ChromaDB...');

    const embeddings = new OpenAIEmbeddings();

    // ChromaDB 인스턴스 생성 및 저장
    await Chroma.fromDocuments(docs, embeddings, {
      collectionName: this.COLLECTION_NAME,

      // ❌ 이전: clientParams: { path: this.VECTOR_STORE_PATH }, (오류 발생)

      // ✅ 수정 1: 로컬 파일 저장을 위해 ChromaClient가 아닌
      //           LangChain의 Chroma 클래스에서 인식하는 url을 사용하거나,
      //           로컬 파일을 위한 설정을 명시하지 않고 클라이언트 초기화에 맡깁니다.

      // 로컬 환경에서 별도의 서버 없이 파일 기반으로 ChromaDB를 실행하는 가장 쉬운 방법은
      // url을 'http://localhost:8000'으로 설정하고, 클라이언트가 데이터를 로컬 파일에 쓰도록 하는 것입니다.
      url: 'http://host.docker.internal:8000',

      // 이 방식은 내부적으로 ChromaDB가 데이터를 로컬 파일에 저장하도록 유도합니다.
      // ChromaClientArgs에는 'path'가 없지만, 'url' 또는 'host/port'를 사용해야 합니다.
    });

    console.log('   -> Storage successful.');
  }
}
