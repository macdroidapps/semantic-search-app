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
  prepareContextWithReranking,
  analyzeRankingQuality,
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
 * POST /api/rag
 * RAG endpoint: вопрос → поиск → LLM → ответ
 * 
 * Body: {
 *   query: string,        // Вопрос пользователя
 *   useRAG: boolean,      // Использовать RAG или нет
 *   rerank: boolean,      // Использовать реранкинг (по умолчанию false)
 *   top_k?: number,       // Количество чанков для поиска (по умолчанию 5)
 *   min_score?: number,   // Минимальный порог релевантности (по умолчанию 0.3)
 *   rerank_config?: Partial<RerankerConfig>  // Конфигурация реранкинга
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Парсинг тела запроса
    const body = await request.json();
    const { 
      query, 
      useRAG = true, 
      rerank = false,
      top_k = 5, 
      min_score = 0.3,
      rerank_config 
    } = body;

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

    console.log(`[API RAG] Запрос: "${query.substring(0, 50)}..." (useRAG=${useRAG}, rerank=${rerank})`);

    let answer: string;
    let sources: any = null;
    let searchResults: any = null;
    let contextQuality: any = null;
    let llmUsage: any = null;
    let rerankingInfo: any = null;

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
      // Если реранкинг включён - берём больше чанков для последующей фильтрации
      const searchTopK = rerank ? (rerank_config?.top_k_for_rerank || 20) : top_k;
      console.log('[API RAG] Поиск релевантных чанков...');
      const results = findMostSimilar(queryEmbedding, searchIndex.chunks, searchTopK);

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

      let finalResults = filteredResults;
      let context: string;

      // Шаг 3: Реранкинг (если включён)
      if (rerank) {
        const rerankStartTime = Date.now();
        console.log('[API RAG] Запуск реранкинга...');
        
        // Применяем конфигурацию реранкинга
        const config: RerankerConfig = {
          ...DEFAULT_RERANKER_CONFIG,
          ...rerank_config,
        };
        
        // Реранжируем результаты
        const rerankedResults = await rerankResults(query, filteredResults, config);
        
        // Фильтруем по порогу rerank_score
        const rerankedFiltered = filterByQuality(rerankedResults, config.min_rerank_score);
        
        // Берём топ-N
        finalResults = getTopRanked(rerankedFiltered, config.final_top_k);
        
        const rerankTime = Date.now() - rerankStartTime;
        
        // Создаём статистику
        const rerankStats = createRerankingStats(
          filteredResults,
          finalResults,
          rerankTime,
          config
        );
        
        // Анализируем изменения
        const qualityAnalysis = analyzeRankingQuality(filteredResults, finalResults);
        
        rerankingInfo = {
          ...rerankStats,
          quality_analysis: qualityAnalysis,
          config_used: config,
        };
        
        console.log(`[API RAG] Реранкинг завершён: ${filteredResults.length} → ${finalResults.length} чанков`);
        console.log(`[API RAG] Средний прирост score: ${rerankStats.avg_score_improvement.toFixed(4)}`);
        
        // Подготавливаем контекст с учётом rerank_score
        context = prepareContextWithReranking(finalResults, query, 8000);
      } else {
        // Без реранкинга - используем обычную подготовку
        context = prepareContextWithLimit(finalResults, 8000);
      }

      // Шаг 4: Оценка качества контекста
      contextQuality = evaluateContextQuality(finalResults);
      console.log('[API RAG] Качество контекста:', contextQuality.quality, `(confidence: ${contextQuality.confidence})`);

      // Шаг 5: Запрос к LLM с контекстом
      console.log('[API RAG] Отправка запроса к LLM с контекстом...');
      const llmResult = await askClaude({
        question: query,
        context: context,
      });

      answer = llmResult.answer;
      llmUsage = llmResult.usage;

      // Извлечение информации об источниках
      sources = extractSourcesInfo(finalResults);
      searchResults = createSourcesSummary(finalResults);

    } else {
      // ============================================
      // РЕЖИМ БЕЗ RAG: Только LLM
      // ============================================

      console.log('[API RAG] Режим без RAG - прямой запрос к LLM...');
      
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
      reranking_enabled: rerank,
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
      
      // Добавляем информацию о реранкинге если использовался
      if (rerank && rerankingInfo) {
        response.rag_info.reranking = rerankingInfo;
      }
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[API RAG] Ошибка:', error);
    
    // Проверяем специфичные ошибки
    if (error.message?.includes('API_KEY')) {
      return NextResponse.json(
        {
          error: 'LLM API ключ не настроен',
          details: 'Добавьте DEEPSEEK_API_KEY или ANTHROPIC_API_KEY в файл .env.local',
          help: 'См. документацию: DEEPSEEK_SETUP.md',
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
      with_reranking: 'Поиск + реранкинг + LLM (улучшенная точность)',
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
      rerank: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Использовать реранкинг для улучшения качества',
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
      rerank_config: {
        type: 'object',
        required: false,
        description: 'Конфигурация реранкинга',
        example: {
          rerank_method: 'hybrid',
          min_rerank_score: 0.5,
          top_k_for_rerank: 20,
          final_top_k: 5,
        },
      },
    },
    examples: {
      with_rag: {
        query: 'Что такое машинное обучение?',
        useRAG: true,
        top_k: 5,
        min_score: 0.3,
      },
      with_reranking: {
        query: 'Что такое машинное обучение?',
        useRAG: true,
        rerank: true,
        rerank_config: {
          rerank_method: 'hybrid',
          min_rerank_score: 0.5,
        },
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
      reranking_enabled: 'boolean - был ли использован реранкинг',
      metadata: {
        duration_seconds: 'number - время выполнения',
        llm_usage: {
          input_tokens: 'number - входные токены',
          output_tokens: 'number - выходные токены',
        },
      },
      rag_info: '(только для useRAG=true) информация о найденных источниках и реранкинге',
    },
    reranking_methods: {
      'keyword-boost': 'Повышение score на основе ключевых слов',
      'semantic-deep': 'Глубокий семантический анализ',
      'hybrid': 'Комбинация keyword + semantic (рекомендуется)',
      'none': 'Без реранкинга',
    },
  });
}
