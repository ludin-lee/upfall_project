// src/chat/chat.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { OpenAI } from '@langchain/openai'; // LLM 모델
import { OpenAIEmbeddings } from '@langchain/openai'; // 임베딩 모델
import { Chroma } from '@langchain/community/vectorstores/chroma'; // VectorDB
import { ChatPromptTemplate } from '@langchain/core/prompts'; // 프롬프트 엔지니어링
import { Runnable, RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { StateGraph, START, END } from '@langchain/langgraph'; // LangGraph 핵심 모듈
import { Document } from '@langchain/core/documents';

// RAG 시스템의 상태를 정의합니다. (LangGraph 필수)

export interface RAGState {
  question: string; // 질문은 문자열이거나 null
  documents: any[]; // 문서 배열
  answer: string; // 답변은 문자열이거나 null
}

@Injectable()
export class ChatService implements OnModuleInit {
  private retriever: any = null;
  private model: OpenAI;
  private graph: Runnable<RAGState, RAGState>;

  // 인덱싱 시 사용했던 설정값
  private readonly COLLECTION_NAME = 'test_collection_name';
  private readonly VECTOR_STORE_PATH = './chroma_data';

  constructor() {
    this.model = new OpenAI({
      modelName: 'gpt-3.5-turbo-instruct',
      temperature: 0,
    });
  }

  async onModuleInit() {
    // ✅ await를 사용하여 안전하게 초기화 순서를 보장합니다.
    await this.initializeRetriever();
    this.initializeGraph();
  }

  /**
   * 1. Retriever 초기화 (VectorDB에 접속)
   */
  private async initializeRetriever() {
    console.log('ChatService: Initializing Retriever...');

    // 이전에 저장했던 ChromaDB 인스턴스에 접속합니다.
    const vectorStore = await Chroma.fromExistingCollection(
      new OpenAIEmbeddings(), // 임베딩 모델은 저장할 때와 동일해야 합니다.
      {
        collectionName: this.COLLECTION_NAME,
        url: 'http://host.docker.internal:8000',
      },
    );

    // VectorStore를 Retriever로 변환
    this.retriever = vectorStore.asRetriever();
    console.log('ChatService: Retriever initialized.');
  }

  /**
   * 2. LangGraph 정의 및 초기화
   */
  private initializeGraph() {
    // 템플릿: Prompt Engineering 핵심
    const promptTemplate = ChatPromptTemplate.fromMessages([
      [
        'system',
        '당신은 제공된 문서를 참조하여 사용자의 질문에 답변하는 전문가 챗봇입니다. ' +
          '사용자에게 제공된 <Context> 내에서만 답변해야 합니다. ' +
          '만약 <Context>에서 답변을 찾을 수 없다면, ' +
          '**"죄송하지만, 제가 참조할 수 있는 문서에서는 해당 내용을 찾을 수 없습니다."**라고 답변하세요.' +
          '\n\n<Context>\n{context}\n</Context>',
      ],
      ['human', '{question}'],
    ]);

    // RAG Chain 정의
    const ragChain = RunnableSequence.from([
      // 검색된 문서를 하나의 문자열로 포맷팅
      {
        context: (input: RAGState) =>
          input.documents
            .map((doc) => (doc as Document).pageContent)
            .join('\n\n'),
        question: (input: RAGState) => input.question, // <<--- 이 부분이 반드시 포함되어야 합니다.
      },
      promptTemplate,
      this.model,
      new StringOutputParser(),
    ]);

    // --- LangGraph 정의 시작 ---

    const graphBuilder = new StateGraph<RAGState>({
      channels: {
        question: null,
        documents: null,
        answer: null,
      },
    });

    const nodes = {
      // 1. 검색 노드: VectorDB에서 문서를 검색합니다.
      retrieve: async (state: RAGState) => {
        console.log('-> Node: RETRIEVE');
        const docs = await this.retriever.invoke(state.question);
        return { ...state, documents: docs };
      },

      // 2. 생성 노드: LLM Chain을 실행하여 답변을 생성합니다.
      generate: async (state: RAGState) => {
        console.log('-> Node: GENERATE');
        // LangChain Runnable Chain 실행
        const answer = await ragChain.invoke({
          question: state.question,
          documents: state.documents,
          answer: state.answer || '',
        });
        return { ...state, answer: answer };
      },
    };

    (graphBuilder.addEdge as any)(START, 'retrieve');
    (graphBuilder.addEdge as any)('retrieve', 'generate');
    (graphBuilder.addEdge as any)('generate', END);

    this.graph = graphBuilder.compile() as any as Runnable<RAGState, RAGState>;
    console.log('ChatService: LangGraph compiled.');
  }

  /**
   * 외부 호출 메서드: 챗봇 실행
   */
  async chat(question: string): Promise<string> {
    if (!this.graph) {
      throw new Error('Chat graph not initialized.');
    }

    // ✅ 수정된 부분: 입력 객체를 RAGState 타입으로 정의
    const initialState: RAGState = {
      question: question,
      documents: [], // Document[] 타입으로 정의했으므로 빈 배열을 초기값으로 제공
      answer: '',
    };

    // LangGraph 실행
    // 이제 graph.invoke는 RAGState 타입 객체를 입력받음을 확신합니다.
    const result: RAGState = await this.graph.invoke(initialState);
    // 최종 상태에서 답변 반환

    return result.answer || '답변을 생성하지 못하였습니다.';
  }
}
