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
 * POST /api/rag
 * RAG endpoint: вопрос → поиск → LLM → ответ
 * 
 * Body: {
 *   query: string,        // Вопрос пользователя
 *   useRAG: boolean,      // Использовать RAG или нет
 *   top_k?: number,       // Количество чанков для поиска (по умолчанию 5)
 *   min_score?: number    // Минимальный порог релевантности (по умолчанию 0.3)
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Парсинг тела запроса
    const body = await request.json();
    const { query, useRAG = true, top_k = 5, min_score = 0.3 } = body;

    // Валидация
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Параметр "query" обязателен и должен быть непустой строкой' },
        { status: 400 }
      );
    }

    if (typeof useRAG !== 'boolean') {
      return NextResponse.json(
        { error: 'Параметр "useRAG" должен быть boolean' },
        { status: 400 }
      );
    }

    console.log(`[API RAG] Запрос: "${query.substring(0, 50)}..." (useRAG=${useRAG})`);

    let answer: string;
    let sources: any = null;
    let searchResults: any = null;
    let contextQuality: any = null;
    let llmUsage: any = null;

    if (useRAG) {
      // ============================================
      // РЕЖИМ С RAG: Поиск + Контекст + LLM
      // ============================================

      // Проверяем существование индекса
      try {
        await fs.access(INDEX_FILE);
      } catch {
        return NextResponse.json(
          {
            error: 'Индекс не найден. Сначала выполните индексацию документов через POST /api/index',
          },
          { status: 404 }
        );
      }

      // Загружаем индекс
      console.log('[API RAG] Загрузка индекса...');
      const indexData = await fs.readFile(INDEX_FILE, 'utf-8');
      const searchIndex: SearchIndex = JSON.parse(indexData);

      if (!searchIndex.chunks || searchIndex.chunks.length === 0) {
        return NextResponse.json(
          {
            error: 'Индекс пуст. Добавьте документы и выполните переиндексацию',
          },
          { status: 400 }
        );
      }

      // Шаг 1: Генерируем эмбеддинг для запроса
      console.log('[API RAG] Генерация эмбеддинга для запроса...');
      const queryEmbedding = await generateEmbedding(query);

      // Шаг 2: Поиск релевантных чанков
      console.log('[API RAG] Поиск релевантных чанков...');
      const results = findMostSimilar(queryEmbedding, searchIndex.chunks, top_k);

      // Фильтрация по минимальному порогу
      const filteredResults = results.filter(r => r.score >= min_score);

      console.log(`[API RAG] Найдено ${filteredResults.length} релевантных чанков`);

      if (filteredResults.length === 0) {
        return NextResponse.json(
          {
            error: 'Не найдено релевантных документов. Попробуйте изменить запрос или уменьшить min_score',
            suggestion: 'Используйте режим без RAG (useRAG: false) для получения общего ответа',
          },
          { status: 404 }
        );
      }

      // Шаг 3: Оценка качества контекста
      contextQuality = evaluateContextQuality(filteredResults);
      console.log('[API RAG] Качество контекста:', contextQuality.quality, `(confidence: ${contextQuality.confidence})`);

      // Шаг 4: Подготовка контекста для LLM
      console.log('[API RAG] Подготовка контекста для LLM...');
      const context = prepareContextWithLimit(filteredResults, 8000);

      // Шаг 5: Запрос к LLM с контекстом
      console.log('[API RAG] Отправка запроса к Claude с контекстом...');
      const llmResult = await askClaude({
        question: query,
        context: context,
      });

      answer = llmResult.answer;
      llmUsage = llmResult.usage;

      // Извлечение информации об источниках
      sources = extractSourcesInfo(filteredResults);
      searchResults = createSourcesSummary(filteredResults);

    } else {
      // ============================================
      // РЕЖИМ БЕЗ RAG: Только LLM
      // ============================================

      console.log('[API RAG] Режим без RAG - прямой запрос к Claude...');
      
      const llmResult = await askClaude({
        question: query,
      });

      answer = llmResult.answer;
      llmUsage = llmResult.usage;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);

    console.log(`[API RAG] Запрос завершён за ${duration}s`);
    console.log(`[API RAG] Использовано токенов: ${llmUsage.input_tokens} вх + ${llmUsage.output_tokens} вых`);

    // Формируем ответ
    const response: any = {
      success: true,
      query,
      answer,
      mode: useRAG ? 'with_rag' : 'without_rag',
      metadata: {
        duration_seconds: parseFloat(duration),
        llm_usage: llmUsage,
      },
    };

    // Добавляем информацию о RAG если использовался
    if (useRAG) {
      response.rag_info = {
        sources,
        search_results: searchResults,
        context_quality: contextQuality,
      };
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[API RAG] Ошибка:', error);
    
    // Проверяем специфичные ошибки
    if (error.message?.includes('ANTHROPIC_API_KEY')) {
      return NextResponse.json(
        {
          error: 'Claude API ключ не настроен',
          details: 'Добавьте ANTHROPIC_API_KEY в файл .env.local',
          help: 'Получите ключ на https://console.anthropic.com/',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Ошибка при обработке RAG запроса',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rag
 * Возвращает информацию о доступных параметрах RAG endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/rag',
    method: 'POST',
    description: 'RAG endpoint для генерации ответов на основе документов',
    modes: {
      with_rag: 'Поиск в документах + генерация ответа на основе найденного',
      without_rag: 'Генерация ответа только из знаний модели',
    },
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Вопрос пользователя',
        example: 'Что такое машинное обучение?',
      },
      useRAG: {
        type: 'boolean',
        required: true,
        description: 'Использовать RAG (поиск в документах) или нет',
        example: true,
      },
      top_k: {
        type: 'number',
        required: false,
        default: 5,
        min: 1,
        max: 20,
        description: 'Количество чанков для поиска',
      },
      min_score: {
        type: 'number',
        required: false,
        default: 0.3,
        min: 0,
        max: 1,
        description: 'Минимальный порог релевантности',
      },
    },
    examples: {
      with_rag: {
        query: 'Что такое машинное обучение?',
        useRAG: true,
        top_k: 5,
        min_score: 0.3,
      },
      without_rag: {
        query: 'Что такое машинное обучение?',
        useRAG: false,
      },
    },
    response_fields: {
      success: 'boolean - статус выполнения',
      query: 'string - исходный запрос',
      answer: 'string - ответ от LLM',
      mode: 'string - with_rag или without_rag',
      metadata: {
        duration_seconds: 'number - время выполнения',
        llm_usage: {
          input_tokens: 'number - входные токены',
          output_tokens: 'number - выходные токены',
        },
      },
      rag_info: '(только для useRAG=true) информация о найденных источниках',
    },
  });
}
