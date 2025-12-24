/**
 * RAG (Retrieval-Augmented Generation) модуль
 * Связывает семантический поиск с LLM для генерации ответов на основе документов
 */

import { SearchResult } from './similarity';
import { RankedResult, RerankingStats } from './reranker';

/**
 * Форматирует найденные чанки в читаемый контекст для LLM
 * 
 * @param results - Результаты семантического поиска
 * @returns Отформатированный текст контекста
 */
export function formatContextForLLM(results: SearchResult[] | RankedResult[]): string {
  if (results.length === 0) {
    return 'Релевантной информации в документах не найдено.';
  }

  // Группируем по источникам для лучшей структуры
  const bySource = results.reduce((acc, result) => {
    if (!acc[result.source]) {
      acc[result.source] = [];
    }
    acc[result.source].push(result);
    return acc;
  }, {} as Record<string, (SearchResult | RankedResult)[]>);

  // Формируем текст
  let context = '';
  
  Object.entries(bySource).forEach(([source, chunks], index) => {
    context += `\n--- ДОКУМЕНТ ${index + 1}: ${source} ---\n`;
    
    chunks.forEach((chunk, chunkIndex) => {
      // Проверяем есть ли rerank_score
      const isRanked = 'rerank_score' in chunk;
      const scoreText = isRanked 
        ? `релевантность: ${(chunk.rerank_score * 100).toFixed(1)}%`
        : `релевантность: ${(chunk.score * 100).toFixed(1)}%`;
      
      context += `\n[Фрагмент ${chunkIndex + 1}, ${scoreText}]\n`;
      context += chunk.text;
      context += '\n';
      
      // Добавляем причину буста если есть
      if (isRanked && chunk.boost_reason) {
        context += `(+буст: ${chunk.boost_reason})\n`;
      }
    });
  });

  return context.trim();
}

/**
 * Извлекает метаданные об источниках из результатов поиска
 * 
 * @param results - Результаты поиска
 * @returns Информация об источниках
 */
export function extractSourcesInfo(results: SearchResult[]) {
  const sources = Array.from(new Set(results.map(r => r.source)));
  
  const sourceStats = sources.map(source => {
    const sourceChunks = results.filter(r => r.source === source);
    const avgScore = sourceChunks.reduce((sum, r) => sum + r.score, 0) / sourceChunks.length;
    
    return {
      filename: source,
      chunks_used: sourceChunks.length,
      avg_relevance: parseFloat(avgScore.toFixed(4)),
      max_relevance: parseFloat(Math.max(...sourceChunks.map(r => r.score)).toFixed(4)),
    };
  });

  return {
    total_sources: sources.length,
    total_chunks: results.length,
    sources: sourceStats,
  };
}

/**
 * Создаёт краткую сводку об использованных источниках (для UI)
 * 
 * @param results - Результаты поиска
 * @returns Массив источников для отображения
 */
export function createSourcesSummary(results: SearchResult[]) {
  return results.map(r => ({
    id: r.id,
    source: r.source,
    text: r.text.substring(0, 150) + (r.text.length > 150 ? '...' : ''),
    score: parseFloat((r.score * 100).toFixed(1)),
  }));
}

/**
 * Оценивает качество найденного контекста
 * Помогает понять, достаточно ли информации для ответа
 * 
 * @param results - Результаты поиска
 * @returns Оценка качества
 */
export function evaluateContextQuality(results: SearchResult[]) {
  if (results.length === 0) {
    return {
      quality: 'none',
      confidence: 0,
      recommendation: 'Релевантной информации не найдено. Модель ответит из общих знаний.',
    };
  }

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const maxScore = Math.max(...results.map(r => r.score));

  let quality: 'high' | 'medium' | 'low';
  let confidence: number;
  let recommendation: string;

  if (maxScore > 0.7 && avgScore > 0.5) {
    quality = 'high';
    confidence = 0.9;
    recommendation = 'Найдена высокорелевантная информация. Ответ будет точным.';
  } else if (maxScore > 0.5 && avgScore > 0.3) {
    quality = 'medium';
    confidence = 0.6;
    recommendation = 'Найдена частично релевантная информация. Ответ может быть неполным.';
  } else {
    quality = 'low';
    confidence = 0.3;
    recommendation = 'Релевантность низкая. Рекомендуется режим без RAG или уточните запрос.';
  }

  return {
    quality,
    confidence,
    recommendation,
    avgScore: parseFloat(avgScore.toFixed(4)),
    maxScore: parseFloat(maxScore.toFixed(4)),
    totalChunks: results.length,
  };
}

/**
 * Подготавливает контекст с ограничением по размеру
 * Важно для не превышения лимитов токенов LLM
 * 
 * @param results - Результаты поиска
 * @param maxChars - Максимум символов (примерно ~4 токена на слово)
 * @returns Обрезанный контекст
 */
export function prepareContextWithLimit(
  results: SearchResult[],
  maxChars: number = 8000 // ~2000 токенов
): string {
  let context = '';
  let currentLength = 0;
  const selectedResults: SearchResult[] = [];

  // Берём чанки по порядку релевантности пока не достигнем лимита
  for (const result of results) {
    const chunkText = `\n[${result.source}]\n${result.text}\n`;
    
    if (currentLength + chunkText.length <= maxChars) {
      selectedResults.push(result);
      currentLength += chunkText.length;
    } else {
      break;
    }
  }

  // Форматируем выбранные чанки
  context = formatContextForLLM(selectedResults);

  console.log(`[RAG] Использовано ${selectedResults.length} из ${results.length} чанков`);
  console.log(`[RAG] Размер контекста: ${context.length} символов`);

  return context;
}

/**
 * Интерфейс результата RAG
 */
export interface RAGResult {
  answer: string;
  sources: {
    filename: string;
    chunks_used: number;
    avg_relevance: number;
    max_relevance: number;
  }[];
  metadata: {
    total_sources: number;
    total_chunks_found: number;
    chunks_used: number;
    context_quality: string;
    confidence: number;
  };
}

/**
 * Подготавливает контекст с реранкингом
 */
export function prepareContextWithReranking(
  results: RankedResult[],
  query: string,
  maxChars: number = 8000
): string {
  let context = '';
  let currentLength = 0;
  const selectedResults: RankedResult[] = [];

  // Берём чанки по порядку rerank_score пока не достигнем лимита
  for (const result of results) {
    const chunkText = `\n[${result.source}, score: ${result.rerank_score}]\n${result.text}\n`;
    
    if (currentLength + chunkText.length <= maxChars) {
      selectedResults.push(result);
      currentLength += chunkText.length;
    } else {
      break;
    }
  }

  // Форматируем выбранные чанки
  context = formatContextForLLM(selectedResults);

  console.log(`[RAG] Использовано ${selectedResults.length} из ${results.length} чанков (с реранкингом)`);
  console.log(`[RAG] Размер контекста: ${context.length} символов`);

  return context;
}

/**
 * Анализирует качество реранкинга
 */
export function analyzeRankingQuality(
  originalResults: SearchResult[],
  rerankedResults: RankedResult[]
): {
  improvement: number;
  top_changed: boolean;
  avg_position_change: number;
} {
  // Проверяем изменился ли топ-1
  const topChanged = originalResults[0]?.id !== rerankedResults[0]?.id;
  
  // Считаем средний сдвиг позиций
  const positionChanges: number[] = [];
  
  rerankedResults.forEach((reranked, newIdx) => {
    const oldIdx = originalResults.findIndex(r => r.id === reranked.id);
    if (oldIdx >= 0) {
      positionChanges.push(Math.abs(oldIdx - newIdx));
    }
  });
  
  const avgPositionChange = positionChanges.length > 0
    ? positionChanges.reduce((a, b) => a + b, 0) / positionChanges.length
    : 0;
  
  // Средний прирост score
  const scoreImprovements = rerankedResults.map(rr => {
    const original = originalResults.find(or => or.id === rr.id);
    return original ? (rr.rerank_score - original.score) : 0;
  });
  
  const improvement = scoreImprovements.reduce((a, b) => a + b, 0) / scoreImprovements.length;
  
  return {
    improvement: parseFloat(improvement.toFixed(4)),
    top_changed: topChanged,
    avg_position_change: parseFloat(avgPositionChange.toFixed(2)),
  };
}
