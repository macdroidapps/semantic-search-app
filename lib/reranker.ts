/**
 * Модуль реранкинга результатов поиска
 * Улучшает точность RAG путём повторного ранжирования найденных чанков
 */

import { SearchResult } from './similarity';
import { generateEmbedding } from './embeddings';

/**
 * Конфигурация реранкера
 */
export interface RerankerConfig {
  // Первичный порог (косинусное сходство)
  min_similarity: number;
  
  // Вторичный порог (после реранкинга)
  min_rerank_score: number;
  
  // Максимум чанков для реранкинга
  top_k_for_rerank: number;
  
  // Финальное количество
  final_top_k: number;
  
  // Метод реранкинга
  rerank_method: 'keyword-boost' | 'semantic-deep' | 'hybrid' | 'llm' | 'none';
  
  // Пороги качества
  quality_thresholds: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Результат после реранкинга
 */
export interface RankedResult extends SearchResult {
  rerank_score: number;
  rerank_method: string;
  original_rank: number;
  boost_reason?: string;
}

/**
 * Статистика реранкинга
 */
export interface RerankingStats {
  original_results: Array<{id: string; score: number; rank: number}>;
  reranked_results: Array<{id: string; score: number; rerank_score: number; rank: number}>;
  filtered_count: number;
  avg_score_improvement: number;
  rerank_method: string;
  rerank_time_ms: number;
  quality_distribution: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_RERANKER_CONFIG: RerankerConfig = {
  min_similarity: 0.3,
  min_rerank_score: 0.5,
  top_k_for_rerank: 20,
  final_top_k: 5,
  rerank_method: 'hybrid',
  quality_thresholds: {
    high: 0.7,
    medium: 0.5,
    low: 0.3,
  },
};

/**
 * Извлекает ключевые слова из текста (простая реализация)
 */
function extractKeywords(text: string): string[] {
  // Удаляем стоп-слова и оставляем значимые слова
  const stopWords = new Set([
    'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'к', 'о', 'у',
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was', 'were',
    'это', 'этот', 'эта', 'быть', 'был', 'была', 'были', 'есть',
  ]);
  
  const words = text
    .toLowerCase()
    .replace(/[^\wа-яё\s]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  return [...new Set(words)]; // уникальные слова
}

/**
 * Метод 1: Keyword Boosting
 * Повышает score если в документе есть ключевые слова из запроса
 */
function rerankByKeywords(
  query: string,
  results: SearchResult[]
): RankedResult[] {
  console.log('[Reranker] Метод: Keyword Boosting');
  
  const queryKeywords = extractKeywords(query);
  console.log('[Reranker] Ключевые слова запроса:', queryKeywords.join(', '));
  
  return results.map((result, index) => {
    const docKeywords = extractKeywords(result.text);
    
    // Считаем пересечение ключевых слов
    const matchingKeywords = queryKeywords.filter(kw => 
      docKeywords.some(dk => dk.includes(kw) || kw.includes(dk))
    );
    
    // Бустим score на основе количества совпадений
    const keywordBoost = matchingKeywords.length / Math.max(queryKeywords.length, 1);
    const rerank_score = result.score * 0.7 + keywordBoost * 0.3;
    
    return {
      ...result,
      rerank_score: parseFloat(rerank_score.toFixed(4)),
      rerank_method: 'keyword-boost',
      original_rank: index + 1,
      boost_reason: matchingKeywords.length > 0 
        ? `Найдено ${matchingKeywords.length} ключевых слов`
        : undefined,
    };
  }).sort((a, b) => b.rerank_score - a.rerank_score);
}

/**
 * Метод 2: Semantic Deep Analysis
 * Более глубокий семантический анализ с учётом контекста
 */
function rerankBySemantic(
  query: string,
  results: SearchResult[]
): RankedResult[] {
  console.log('[Reranker] Метод: Semantic Deep Analysis');
  
  return results.map((result, index) => {
    let rerank_score = result.score;
    let boost_reason: string | undefined;
    
    // Фактор 1: Позиция в документе (первые чанки важнее)
    const positionBoost = result.metadata?.position === 0 ? 0.1 : 0;
    
    // Фактор 2: Длина текста (оптимальная длина 200-500 символов)
    const textLength = result.text.length;
    const lengthBoost = textLength >= 200 && textLength <= 500 ? 0.05 : 0;
    
    // Фактор 3: Наличие конкретных данных (цифры, даты, имена)
    const hasSpecificData = /\d+|[A-ZА-Я][a-zа-я]+\s+[A-ZА-Я][a-zа-я]+/.test(result.text);
    const dataBoost = hasSpecificData ? 0.05 : 0;
    
    // Фактор 4: Прямое упоминание ключевых слов
    const queryWords = query.toLowerCase().split(/\s+/);
    const directMatches = queryWords.filter(word => 
      word.length > 3 && result.text.toLowerCase().includes(word)
    ).length;
    const directMatchBoost = Math.min(directMatches * 0.05, 0.15);
    
    rerank_score = Math.min(rerank_score + positionBoost + lengthBoost + dataBoost + directMatchBoost, 1.0);
    
    const boostFactors = [];
    if (positionBoost > 0) boostFactors.push('первый чанк');
    if (lengthBoost > 0) boostFactors.push('оптимальная длина');
    if (dataBoost > 0) boostFactors.push('конкретные данные');
    if (directMatchBoost > 0) boostFactors.push(`${directMatches} прямых совпадений`);
    
    if (boostFactors.length > 0) {
      boost_reason = boostFactors.join(', ');
    }
    
    return {
      ...result,
      rerank_score: parseFloat(rerank_score.toFixed(4)),
      rerank_method: 'semantic-deep',
      original_rank: index + 1,
      boost_reason,
    };
  }).sort((a, b) => b.rerank_score - a.rerank_score);
}

/**
 * Метод 3: Hybrid (комбинация keyword + semantic)
 * Рекомендуемый метод
 */
function rerankHybrid(
  query: string,
  results: SearchResult[]
): RankedResult[] {
  console.log('[Reranker] Метод: Hybrid (Keyword + Semantic)');
  
  // Применяем оба метода
  const keywordResults = rerankByKeywords(query, results);
  const semanticResults = rerankBySemantic(query, results);
  
  // Создаём мапу для быстрого доступа
  const semanticMap = new Map(
    semanticResults.map(r => [r.id, r.rerank_score])
  );
  
  // Комбинируем scores (50/50)
  return keywordResults.map(result => {
    const semanticScore = semanticMap.get(result.id) || result.score;
    const hybridScore = (result.rerank_score * 0.5 + semanticScore * 0.5);
    
    return {
      ...result,
      rerank_score: parseFloat(hybridScore.toFixed(4)),
      rerank_method: 'hybrid',
      boost_reason: result.boost_reason,
    };
  }).sort((a, b) => b.rerank_score - a.rerank_score);
}

/**
 * Основная функция реранкинга
 */
export async function rerankResults(
  query: string,
  searchResults: SearchResult[],
  config: RerankerConfig = DEFAULT_RERANKER_CONFIG
): Promise<RankedResult[]> {
  console.log(`[Reranker] Начало реранкинга: ${searchResults.length} результатов`);
  console.log(`[Reranker] Метод: ${config.rerank_method}`);
  
  if (searchResults.length === 0) {
    return [];
  }
  
  // Применяем выбранный метод
  let rankedResults: RankedResult[];
  
  switch (config.rerank_method) {
    case 'keyword-boost':
      rankedResults = rerankByKeywords(query, searchResults);
      break;
      
    case 'semantic-deep':
      rankedResults = rerankBySemantic(query, searchResults);
      break;
      
    case 'hybrid':
      rankedResults = rerankHybrid(query, searchResults);
      break;
      
    case 'none':
      rankedResults = searchResults.map((result, index) => ({
        ...result,
        rerank_score: result.score,
        rerank_method: 'none',
        original_rank: index + 1,
      }));
      break;
      
    default:
      rankedResults = rerankHybrid(query, searchResults);
  }
  
  console.log(`[Reranker] Результаты отранжированы: ${rankedResults.length}`);
  
  return rankedResults;
}

/**
 * Фильтрация по качеству
 */
export function filterByQuality(
  results: RankedResult[],
  threshold: number
): RankedResult[] {
  const filtered = results.filter(r => r.rerank_score >= threshold);
  console.log(`[Reranker] Фильтрация: ${results.length} → ${filtered.length} (порог: ${threshold})`);
  return filtered;
}

/**
 * Анализ качества результатов
 */
export function analyzeQuality(
  results: RankedResult[],
  thresholds: RerankerConfig['quality_thresholds']
): { high: number; medium: number; low: number } {
  const distribution = {
    high: 0,
    medium: 0,
    low: 0,
  };
  
  results.forEach(result => {
    if (result.rerank_score >= thresholds.high) {
      distribution.high++;
    } else if (result.rerank_score >= thresholds.medium) {
      distribution.medium++;
    } else if (result.rerank_score >= thresholds.low) {
      distribution.low++;
    }
  });
  
  return distribution;
}

/**
 * Создание статистики реранкинга
 */
export function createRerankingStats(
  originalResults: SearchResult[],
  rerankedResults: RankedResult[],
  rerankTimeMs: number,
  config: RerankerConfig
): RerankingStats {
  // Средний прирост score
  const scoreImprovements = rerankedResults.map((rr, idx) => {
    const original = originalResults.find(or => or.id === rr.id);
    if (original) {
      return rr.rerank_score - original.score;
    }
    return 0;
  });
  
  const avgImprovement = scoreImprovements.reduce((a, b) => a + b, 0) / scoreImprovements.length;
  
  // Распределение по качеству
  const qualityDist = analyzeQuality(rerankedResults, config.quality_thresholds);
  
  return {
    original_results: originalResults.map((r, idx) => ({
      id: r.id,
      score: r.score,
      rank: idx + 1,
    })),
    reranked_results: rerankedResults.map((r, idx) => ({
      id: r.id,
      score: r.score,
      rerank_score: r.rerank_score,
      rank: idx + 1,
    })),
    filtered_count: originalResults.length - rerankedResults.length,
    avg_score_improvement: parseFloat(avgImprovement.toFixed(4)),
    rerank_method: config.rerank_method,
    rerank_time_ms: rerankTimeMs,
    quality_distribution: qualityDist,
  };
}

/**
 * Сравнение разных методов реранкинга
 */
export async function compareRankingMethods(
  query: string,
  results: SearchResult[]
): Promise<{
  none: RankedResult[];
  keyword: RankedResult[];
  semantic: RankedResult[];
  hybrid: RankedResult[];
}> {
  console.log('[Reranker] Сравнение всех методов...');
  
  return {
    none: results.map((r, idx) => ({
      ...r,
      rerank_score: r.score,
      rerank_method: 'none',
      original_rank: idx + 1,
    })),
    keyword: rerankByKeywords(query, results),
    semantic: rerankBySemantic(query, results),
    hybrid: rerankHybrid(query, results),
  };
}

/**
 * Получить топ-N результатов после реранкинга
 */
export function getTopRanked(
  results: RankedResult[],
  topK: number,
  minScore?: number
): RankedResult[] {
  let filtered = results;
  
  if (minScore !== undefined) {
    filtered = results.filter(r => r.rerank_score >= minScore);
  }
  
  return filtered.slice(0, topK);
}
