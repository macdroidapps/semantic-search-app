import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { generateEmbedding } from '@/lib/embeddings';
import { findMostSimilar } from '@/lib/similarity';
import { SearchIndex } from '@/lib/types';
import { compareRankingMethods } from '@/lib/reranker';
import { analyzeQuality, DEFAULT_RERANKER_CONFIG } from '@/lib/reranker';

const INDEX_FILE = path.join(process.cwd(), 'data', 'index.json');

/**
 * POST /api/rag/rerank-compare
 * Сравнение разных методов реранкинга
 * 
 * Body: {
 *   query: string,
 *   top_k?: number,
 *   min_score?: number
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { query, top_k = 20, min_score = 0.2 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Параметр "query" обязателен' },
        { status: 400 }
      );
    }

    console.log(`[API Rerank Compare] Сравнение методов для: "${query.substring(0, 50)}..."`);

    // Загружаем индекс
    const indexData = await fs.readFile(INDEX_FILE, 'utf-8');
    const searchIndex: SearchIndex = JSON.parse(indexData);

    // Генерируем эмбеддинг
    const queryEmbedding = await generateEmbedding(query);

    // Поиск чанков
    const searchResults = findMostSimilar(queryEmbedding, searchIndex.chunks, top_k);
    const filteredResults = searchResults.filter(r => r.score >= min_score);

    console.log(`[API Rerank Compare] Найдено ${filteredResults.length} чанков для сравнения`);

    if (filteredResults.length === 0) {
      return NextResponse.json(
        { error: 'Не найдено релевантных документов' },
        { status: 404 }
      );
    }

    // Сравниваем все методы
    const comparison = await compareRankingMethods(query, filteredResults);

    // Анализируем качество каждого метода
    const analysis = {
      none: {
        results: comparison.none.slice(0, 5),
        quality: analyzeQuality(comparison.none, DEFAULT_RERANKER_CONFIG.quality_thresholds),
        avg_score: comparison.none.reduce((sum, r) => sum + r.rerank_score, 0) / comparison.none.length,
      },
      keyword: {
        results: comparison.keyword.slice(0, 5),
        quality: analyzeQuality(comparison.keyword, DEFAULT_RERANKER_CONFIG.quality_thresholds),
        avg_score: comparison.keyword.reduce((sum, r) => sum + r.rerank_score, 0) / comparison.keyword.length,
      },
      semantic: {
        results: comparison.semantic.slice(0, 5),
        quality: analyzeQuality(comparison.semantic, DEFAULT_RERANKER_CONFIG.quality_thresholds),
        avg_score: comparison.semantic.reduce((sum, r) => sum + r.rerank_score, 0) / comparison.semantic.length,
      },
      hybrid: {
        results: comparison.hybrid.slice(0, 5),
        quality: analyzeQuality(comparison.hybrid, DEFAULT_RERANKER_CONFIG.quality_thresholds),
        avg_score: comparison.hybrid.reduce((sum, r) => sum + r.rerank_score, 0) / comparison.hybrid.length,
      },
    };

    // Определяем лучший метод
    const scores = {
      none: analysis.none.avg_score,
      keyword: analysis.keyword.avg_score,
      semantic: analysis.semantic.avg_score,
      hybrid: analysis.hybrid.avg_score,
    };

    const bestMethod = Object.entries(scores).reduce((a, b) => 
      b[1] > a[1] ? b : a
    )[0];

    // Сравнительная таблица топ-5 результатов
    const topComparison = [];
    for (let i = 0; i < 5; i++) {
      if (i < filteredResults.length) {
        topComparison.push({
          rank: i + 1,
          none: {
            id: comparison.none[i]?.id || null,
            score: comparison.none[i]?.rerank_score || 0,
            source: comparison.none[i]?.source || null,
          },
          keyword: {
            id: comparison.keyword[i]?.id || null,
            score: comparison.keyword[i]?.rerank_score || 0,
            source: comparison.keyword[i]?.source || null,
            boost: comparison.keyword[i]?.boost_reason || null,
          },
          semantic: {
            id: comparison.semantic[i]?.id || null,
            score: comparison.semantic[i]?.rerank_score || 0,
            source: comparison.semantic[i]?.source || null,
            boost: comparison.semantic[i]?.boost_reason || null,
          },
          hybrid: {
            id: comparison.hybrid[i]?.id || null,
            score: comparison.hybrid[i]?.rerank_score || 0,
            source: comparison.hybrid[i]?.source || null,
            boost: comparison.hybrid[i]?.boost_reason || null,
          },
        });
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);

    return NextResponse.json({
      success: true,
      query,
      methods_compared: ['none', 'keyword-boost', 'semantic-deep', 'hybrid'],
      best_method: bestMethod,
      analysis,
      top_5_comparison: topComparison,
      recommendations: {
        best_overall: 'hybrid',
        for_keyword_queries: 'keyword-boost',
        for_semantic_queries: 'semantic-deep',
        fastest: 'keyword-boost',
        most_accurate: 'hybrid',
      },
      metadata: {
        total_results: filteredResults.length,
        duration_seconds: parseFloat(duration),
      },
    });

  } catch (error: any) {
    console.error('[API Rerank Compare] Ошибка:', error);
    return NextResponse.json(
      {
        error: 'Ошибка при сравнении методов',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rag/rerank-compare
 * Информация об endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/rag/rerank-compare',
    method: 'POST',
    description: 'Сравнение разных методов реранкинга',
    purpose: 'Помогает выбрать оптимальный метод реранкинга для вашего случая',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Запрос для тестирования',
      },
      top_k: {
        type: 'number',
        default: 20,
        description: 'Количество чанков для анализа',
      },
      min_score: {
        type: 'number',
        default: 0.2,
        description: 'Минимальный порог',
      },
    },
    methods: {
      none: 'Без реранкинга (baseline)',
      'keyword-boost': 'Повышение на основе ключевых слов',
      'semantic-deep': 'Глубокий семантический анализ',
      hybrid: 'Комбинация keyword + semantic',
    },
    use_cases: [
      'Выбор оптимального метода реранкинга',
      'A/B тестирование методов',
      'Оценка улучшения качества',
      'Отладка и тестирование',
    ],
    example: {
      query: 'Какая база данных используется в проекте?',
      top_k: 20,
      min_score: 0.2,
    },
  });
}
