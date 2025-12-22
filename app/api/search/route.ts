import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { generateEmbedding } from '@/lib/embeddings';
import { findMostSimilar, filterByMinScore, getSearchStats } from '@/lib/similarity';
import { SearchIndex } from '@/lib/types';

const INDEX_FILE = path.join(process.cwd(), 'data', 'index.json');

/**
 * POST /api/search
 * Выполняет семантический поиск по индексу
 * 
 * Body: {
 *   query: string,        // Поисковый запрос
 *   top_k?: number,       // Количество результатов (по умолчанию 5)
 *   min_score?: number    // Минимальный порог сходства (по умолчанию 0.3)
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Парсинг тела запроса
    const body = await request.json();
    const { query, top_k = 5, min_score = 0.3 } = body;

    // Валидация
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Параметр "query" обязателен и должен быть непустой строкой' },
        { status: 400 }
      );
    }

    if (typeof top_k !== 'number' || top_k < 1 || top_k > 100) {
      return NextResponse.json(
        { error: 'Параметр "top_k" должен быть числом от 1 до 100' },
        { status: 400 }
      );
    }

    if (typeof min_score !== 'number' || min_score < 0 || min_score > 1) {
      return NextResponse.json(
        { error: 'Параметр "min_score" должен быть числом от 0 до 1' },
        { status: 400 }
      );
    }

    console.log(`[API Search] Запрос: "${query}" (top_k=${top_k}, min_score=${min_score})`);

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
    console.log('[API Search] Загрузка индекса...');
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

    // Генерируем эмбеддинг для запроса
    console.log('[API Search] Генерация эмбеддинга для запроса...');
    const queryEmbedding = await generateEmbedding(query);

    // Поиск наиболее похожих результатов
    console.log('[API Search] Поиск релевантных чанков...');
    let results = findMostSimilar(queryEmbedding, searchIndex.chunks, top_k);

    // Фильтрация по минимальному порогу
    results = filterByMinScore(results, min_score);

    // Статистика поиска
    const stats = getSearchStats(results);

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);

    console.log(`[API Search] Найдено ${results.length} результатов за ${duration}s`);

    return NextResponse.json({
      success: true,
      query,
      results: results.map(r => ({
        id: r.id,
        text: r.text,
        source: r.source,
        score: parseFloat(r.score.toFixed(4)),
        metadata: r.metadata,
      })),
      stats: {
        total_results: results.length,
        avg_score: parseFloat(stats.avgScore.toFixed(4)),
        max_score: parseFloat(stats.maxScore.toFixed(4)),
        min_score: parseFloat(stats.minScore.toFixed(4)),
        duration_seconds: parseFloat(duration),
      },
      index_info: {
        total_chunks: searchIndex.metadata.total_chunks,
        model: searchIndex.metadata.model,
      },
    });
  } catch (error: any) {
    console.error('[API Search] Ошибка поиска:', error);
    return NextResponse.json(
      {
        error: 'Ошибка при выполнении поиска',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/search
 * Возвращает информацию о доступных параметрах поиска
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/search',
    method: 'POST',
    description: 'Семантический поиск по индексированным документам',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Текст поискового запроса',
      },
      top_k: {
        type: 'number',
        required: false,
        default: 5,
        min: 1,
        max: 100,
        description: 'Количество возвращаемых результатов',
      },
      min_score: {
        type: 'number',
        required: false,
        default: 0.3,
        min: 0,
        max: 1,
        description: 'Минимальный порог сходства для фильтрации результатов',
      },
    },
    example: {
      query: 'семантический поиск',
      top_k: 5,
      min_score: 0.3,
    },
  });
}
