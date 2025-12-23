import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { generateEmbedding } from '@/lib/embeddings';
import { findMostSimilar } from '@/lib/similarity';
import { SearchIndex } from '@/lib/types';
import { askClaude } from '@/lib/llm';
import {
  formatContextForLLM,
  extractSourcesInfo,
  evaluateContextQuality,
  prepareContextWithLimit,
  createSourcesSummary,
} from '@/lib/rag';

const INDEX_FILE = path.join(process.cwd(), 'data', 'index.json');

/**
 * POST /api/rag/compare
 * Сравнение режимов: с RAG vs без RAG
 * Запускает оба режима параллельно и возвращает оба результата
 * 
 * Body: {
 *   query: string,        // Вопрос пользователя
 *   top_k?: number,       // Количество чанков (по умолчанию 5)
 *   min_score?: number    // Минимальный порог (по умолчанию 0.3)
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { query, top_k = 5, min_score = 0.3 } = body;

    // Валидация
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Параметр "query" обязателен' },
        { status: 400 }
      );
    }

    console.log(`[API RAG Compare] Сравнение для запроса: "${query.substring(0, 50)}..."`);

    // Проверяем индекс
    let indexExists = true;
    try {
      await fs.access(INDEX_FILE);
    } catch {
      indexExists = false;
    }

    if (!indexExists) {
      return NextResponse.json(
        {
          error: 'Индекс не найден. Создайте индекс через POST /api/index',
        },
        { status: 404 }
      );
    }

    // Загружаем индекс
    const indexData = await fs.readFile(INDEX_FILE, 'utf-8');
    const searchIndex: SearchIndex = JSON.parse(indexData);

    // Запускаем оба режима ПАРАЛЛЕЛЬНО
    console.log('[API RAG Compare] Запуск обоих режимов параллельно...');

    const [withRAGResult, withoutRAGResult] = await Promise.allSettled([
      // Режим С RAG
      (async () => {
        try {
          // Поиск чанков
          const queryEmbedding = await generateEmbedding(query);
          const results = findMostSimilar(queryEmbedding, searchIndex.chunks, top_k);
          const filteredResults = results.filter(r => r.score >= min_score);

          if (filteredResults.length === 0) {
            throw new Error('Не найдено релевантных документов');
          }

          // Подготовка контекста
          const context = prepareContextWithLimit(filteredResults, 8000);
          const contextQuality = evaluateContextQuality(filteredResults);

          // Запрос к LLM
          const llmResult = await askClaude({
            question: query,
            context: context,
          });

          return {
            success: true,
            answer: llmResult.answer,
            sources: extractSourcesInfo(filteredResults),
            search_results: createSourcesSummary(filteredResults),
            context_quality: contextQuality,
            llm_usage: llmResult.usage,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      })(),

      // Режим БЕЗ RAG
      (async () => {
        try {
          const llmResult = await askClaude({
            question: query,
          });

          return {
            success: true,
            answer: llmResult.answer,
            llm_usage: llmResult.usage,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
          };
        }
      })(),
    ]);

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);

    console.log(`[API RAG Compare] Сравнение завершено за ${duration}s`);

    // Обрабатываем результаты
    const withRAG = withRAGResult.status === 'fulfilled' ? withRAGResult.value : null;
    const withoutRAG = withoutRAGResult.status === 'fulfilled' ? withoutRAGResult.value : null;

    // Анализируем различия
    const comparison = {
      both_successful: withRAG?.success && withoutRAG?.success,
      answers_differ: withRAG?.answer !== withoutRAG?.answer,
    };

    if (withRAG?.success && withoutRAG?.success) {
      // Простой анализ различий
      const ragAnswerLength = withRAG.answer.length;
      const noRagAnswerLength = withoutRAG.answer.length;
      
      comparison.analysis = {
        rag_answer_length: ragAnswerLength,
        no_rag_answer_length: noRagAnswerLength,
        length_difference: Math.abs(ragAnswerLength - noRagAnswerLength),
        rag_used_sources: withRAG.sources?.total_sources || 0,
        rag_context_quality: withRAG.context_quality?.quality || 'unknown',
        recommendation: getRecommendation(withRAG, withoutRAG),
      };
    }

    return NextResponse.json({
      success: true,
      query,
      results: {
        with_rag: withRAG,
        without_rag: withoutRAG,
      },
      comparison,
      metadata: {
        duration_seconds: parseFloat(duration),
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('[API RAG Compare] Ошибка:', error);
    return NextResponse.json(
      {
        error: 'Ошибка при сравнении режимов',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Анализирует результаты и даёт рекомендацию
 */
function getRecommendation(withRAG: any, withoutRAG: any): string {
  const contextQuality = withRAG.context_quality?.quality;
  const confidence = withRAG.context_quality?.confidence || 0;

  if (contextQuality === 'high' && confidence > 0.7) {
    return 'RAG значительно улучшил ответ. Используйте режим с RAG для этого типа вопросов.';
  } else if (contextQuality === 'medium' && confidence > 0.5) {
    return 'RAG частично помог. Сравните оба ответа и выберите подходящий.';
  } else if (contextQuality === 'low' || confidence < 0.4) {
    return 'RAG не помог или даже ухудшил ответ. Используйте режим без RAG для общих вопросов.';
  }

  return 'Оба режима дали похожие результаты. Выберите любой.';
}

/**
 * GET /api/rag/compare
 * Возвращает информацию о сравнении
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/rag/compare',
    method: 'POST',
    description: 'Сравнение режимов с RAG и без RAG',
    purpose: 'Помогает понять когда RAG полезен, а когда нет',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Вопрос для сравнения',
      },
      top_k: {
        type: 'number',
        default: 5,
        description: 'Количество чанков для RAG режима',
      },
      min_score: {
        type: 'number',
        default: 0.3,
        description: 'Минимальный порог релевантности',
      },
    },
    response: {
      with_rag: 'Результат с использованием RAG',
      without_rag: 'Результат без RAG',
      comparison: 'Анализ различий и рекомендации',
    },
    example: {
      query: 'Что такое машинное обучение?',
      top_k: 5,
      min_score: 0.3,
    },
    use_cases: [
      'Сравнение точности ответов',
      'Оценка полезности RAG для разных типов вопросов',
      'A/B тестирование режимов',
      'Выбор оптимального режима для конкретной задачи',
    ],
  });
}
