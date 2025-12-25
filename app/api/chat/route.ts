import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { generateEmbedding } from '@/lib/embeddings';
import { findMostSimilar } from '@/lib/similarity';
import { SearchIndex } from '@/lib/types';
import { askLLM } from '@/lib/llm';
import {
  prepareContextWithLimit,
  extractSourcesInfo,
  evaluateContextQuality,
} from '@/lib/rag';
import {
  rerankResults,
  filterByQuality,
  getTopRanked,
  createRerankingStats,
  DEFAULT_RERANKER_CONFIG,
  type RerankerConfig,
} from '@/lib/reranker';

const INDEX_FILE = path.join(process.cwd(), 'data', 'index.json');

/**
 * Интерфейс сообщения в чате
 */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: any;
}

/**
 * POST /api/chat
 * Чат endpoint с памятью и RAG
 * 
 * Body: {
 *   message: string,          // Новое сообщение пользователя
 *   history: ChatMessage[],   // История диалога
 *   useRAG: boolean,          // Использовать RAG
 *   useReranking: boolean,    // Использовать реранкинг
 *   rerank_config?: Partial<RerankerConfig>
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { 
      message, 
      history = [], 
      useRAG = true,
      useReranking = false,
      rerank_config 
    } = body;

    // Валидация
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Параметр "message" обязателен' },
        { status: 400 }
      );
    }

    if (!Array.isArray(history)) {
      return NextResponse.json(
        { error: 'Параметр "history" должен быть массивом' },
        { status: 400 }
      );
    }

    console.log(`[API Chat] Новое сообщение: "${message.substring(0, 50)}..."`);
    console.log(`[API Chat] История: ${history.length} сообщений`);
    console.log(`[API Chat] RAG: ${useRAG}, Reranking: ${useReranking}`);

    let answer: string;
    let sources: any = null;
    let searchResults: any = null;
    let contextQuality: any = null;
    let llmUsage: any = null;
    let rerankingInfo: any = null;

    if (useRAG) {
      // ============================================
      // РЕЖИМ С RAG: Поиск контекста + История
      // ============================================

      // Проверяем индекс
      try {
        await fs.access(INDEX_FILE);
      } catch {
        return NextResponse.json(
          { error: 'Индекс не найден. Выполните индексацию документов' },
          { status: 404 }
        );
      }

      // Загружаем индекс
      const indexData = await fs.readFile(INDEX_FILE, 'utf-8');
      const searchIndex: SearchIndex = JSON.parse(indexData);

      if (!searchIndex.chunks || searchIndex.chunks.length === 0) {
        return NextResponse.json(
          { error: 'Индекс пуст. Добавьте документы' },
          { status: 400 }
        );
      }

      // Генерируем эмбеддинг для вопроса
      console.log('[API Chat] Генерация эмбеддинга...');
      const queryEmbedding = await generateEmbedding(message);

      // Поиск релевантных чанков
      const searchTopK = useReranking ? (rerank_config?.top_k_for_rerank || 15) : 5;
      const results = findMostSimilar(queryEmbedding, searchIndex.chunks, searchTopK);
      const filteredResults = results.filter(r => r.score >= 0.3);

      console.log(`[API Chat] Найдено ${filteredResults.length} релевантных чанков`);

      if (filteredResults.length === 0) {
        // Нет релевантных документов - отвечаем на основе истории
        console.log('[API Chat] Нет релевантных документов, используем только историю');
        
        const llmResult = await askLLM({
          question: message,
          conversationHistory: history.map(h => ({
            role: h.role,
            content: h.content,
          })),
          systemPrompt: 'Ты полезный ассистент. Отвечай на основе истории диалога.',
        });

        answer = llmResult.answer;
        llmUsage = llmResult.usage;

      } else {
        // Есть релевантные документы
        let finalResults = filteredResults;
        let context: string;

        // Реранкинг если включён
        if (useReranking) {
          const rerankStartTime = Date.now();
          console.log('[API Chat] Реранкинг...');
          
          const config: RerankerConfig = {
            ...DEFAULT_RERANKER_CONFIG,
            ...rerank_config,
          };
          
          const rerankedResults = await rerankResults(message, filteredResults, config);
          const rerankedFiltered = filterByQuality(rerankedResults, config.min_rerank_score);
          finalResults = getTopRanked(rerankedFiltered, config.final_top_k);
          
          const rerankTime = Date.now() - rerankStartTime;
          
          rerankingInfo = createRerankingStats(
            filteredResults,
            finalResults,
            rerankTime,
            config
          );
          
          console.log(`[API Chat] Реранкинг: ${filteredResults.length} → ${finalResults.length}`);
        }

        // Подготовка контекста
        context = prepareContextWithLimit(finalResults, 6000);
        contextQuality = evaluateContextQuality(finalResults);
        
        // Формируем историю для LLM
        const conversationHistory = history.slice(-6).map(h => ({
          role: h.role,
          content: h.content,
        }));

        // Запрос к LLM с контекстом и историей
        console.log('[API Chat] Запрос к LLM с контекстом и историей...');
        const llmResult = await askLLM({
          question: message,
          context: context,
          conversationHistory,
          systemPrompt: `Ты полезный ассистент, отвечающий на вопросы на основе предоставленных документов и истории диалога.

ВАЖНО:
1. Используй информацию из документов для ответа
2. Учитывай контекст предыдущих сообщений
3. Если информации нет в документах - скажи об этом
4. Всегда указывай источники информации
5. Отвечай кратко и по существу`,
        });

        answer = llmResult.answer;
        llmUsage = llmResult.usage;

        // Извлекаем источники
        sources = extractSourcesInfo(finalResults);
        searchResults = {
          total_found: finalResults.length,
          chunks: finalResults.map(r => ({
            source: r.source,
            score: (r.score * 100).toFixed(1) + '%',
            text: r.text.substring(0, 200) + '...',
          })),
        };
      }

    } else {
      // ============================================
      // РЕЖИМ БЕЗ RAG: Только история
      // ============================================

      console.log('[API Chat] Режим без RAG - используем только историю');
      
      const conversationHistory = history.slice(-6).map(h => ({
        role: h.role,
        content: h.content,
      }));

      const llmResult = await askLLM({
        question: message,
        conversationHistory,
        systemPrompt: 'Ты полезный ассистент. Отвечай на основе истории диалога.',
      });

      answer = llmResult.answer;
      llmUsage = llmResult.usage;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);

    console.log(`[API Chat] Запрос завершён за ${duration}s`);
    console.log(`[API Chat] Токены: ${llmUsage.input_tokens} вх + ${llmUsage.output_tokens} вых`);

    // Формируем ответ
    const response: any = {
      success: true,
      message: answer,
      sources: sources || null,
      metadata: {
        duration_seconds: parseFloat(duration),
        llm_usage: llmUsage,
        history_length: history.length,
        mode: useRAG ? 'with_rag' : 'without_rag',
        reranking_enabled: useReranking,
      },
    };

    if (useRAG && sources) {
      response.rag_info = {
        search_results: searchResults,
        context_quality: contextQuality,
      };
      
      if (useReranking && rerankingInfo) {
        response.rag_info.reranking = rerankingInfo;
      }
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[API Chat] Ошибка:', error);
    
    if (error.message?.includes('API_KEY')) {
      return NextResponse.json(
        {
          error: 'LLM API ключ не настроен',
          details: 'Добавьте DEEPSEEK_API_KEY или ANTHROPIC_API_KEY в .env.local',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Ошибка при обработке чата',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat
 * Информация о chat endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/chat',
    method: 'POST',
    description: 'Чат с памятью и RAG поддержкой',
    features: [
      'История диалога (последние 6 сообщений)',
      'Поиск в документах через RAG',
      'Реранкинг для улучшения точности',
      'Источники информации',
      'Учёт контекста предыдущих сообщений',
    ],
    parameters: {
      message: {
        type: 'string',
        required: true,
        description: 'Новое сообщение пользователя',
      },
      history: {
        type: 'ChatMessage[]',
        required: false,
        default: [],
        description: 'История диалога',
        example: [
          { role: 'user', content: 'Привет!', timestamp: '2024-01-01T12:00:00Z' },
          { role: 'assistant', content: 'Здравствуйте!', timestamp: '2024-01-01T12:00:01Z' },
        ],
      },
      useRAG: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Использовать RAG для поиска в документах',
      },
      useReranking: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Использовать реранкинг',
      },
    },
    response: {
      success: 'boolean',
      message: 'string - ответ ассистента',
      sources: 'object - источники информации',
      metadata: {
        duration_seconds: 'number',
        llm_usage: 'object',
        history_length: 'number',
        mode: 'string',
      },
    },
  });
}
