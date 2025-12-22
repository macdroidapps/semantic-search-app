/**
 * Вычисляет косинусное сходство между двумя векторами
 * Предполагается, что векторы уже нормализованы
 * 
 * @param vec1 - Первый вектор
 * @param vec2 - Второй вектор
 * @returns Значение сходства от -1 до 1 (чем ближе к 1, тем больше сходство)
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Векторы должны иметь одинаковую размерность');
  }

  // Для нормализованных векторов косинусное сходство = скалярное произведение
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
  }

  return dotProduct;
}

/**
 * Интерфейс для элемента с эмбеддингом
 */
export interface EmbeddedItem {
  id: string;
  text: string;
  source: string;
  embedding: number[];
  metadata?: any;
}

/**
 * Результат поиска с оценкой релевантности
 */
export interface SearchResult {
  id: string;
  text: string;
  source: string;
  score: number;
  metadata?: any;
}

/**
 * Находит наиболее похожие элементы на основе эмбеддинга запроса
 * 
 * @param queryEmbedding - Эмбеддинг поискового запроса
 * @param items - Массив элементов с эмбеддингами
 * @param topK - Количество результатов для возврата
 * @returns Массив наиболее релевантных результатов, отсортированный по убыванию score
 */
export function findMostSimilar(
  queryEmbedding: number[],
  items: EmbeddedItem[],
  topK: number = 5
): SearchResult[] {
  // Вычисляем сходство для каждого элемента
  const results: SearchResult[] = items.map(item => ({
    id: item.id,
    text: item.text,
    source: item.source,
    score: cosineSimilarity(queryEmbedding, item.embedding),
    metadata: item.metadata,
  }));

  // Сортируем по убыванию score
  results.sort((a, b) => b.score - a.score);

  // Возвращаем топ-K результатов
  return results.slice(0, topK);
}

/**
 * Фильтрует результаты по минимальному порогу сходства
 * 
 * @param results - Результаты поиска
 * @param minScore - Минимальный порог (от 0 до 1)
 * @returns Отфильтрованные результаты
 */
export function filterByMinScore(results: SearchResult[], minScore: number = 0.3): SearchResult[] {
  return results.filter(result => result.score >= minScore);
}

/**
 * Группирует результаты по источнику (файлу)
 * 
 * @param results - Результаты поиска
 * @returns Объект, где ключ - имя файла, значение - массив результатов
 */
export function groupBySource(results: SearchResult[]): Record<string, SearchResult[]> {
  return results.reduce((acc, result) => {
    if (!acc[result.source]) {
      acc[result.source] = [];
    }
    acc[result.source].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);
}

/**
 * Вычисляет статистику по результатам поиска
 */
export function getSearchStats(results: SearchResult[]) {
  if (results.length === 0) {
    return {
      count: 0,
      avgScore: 0,
      maxScore: 0,
      minScore: 0,
    };
  }

  const scores = results.map(r => r.score);
  const sum = scores.reduce((a, b) => a + b, 0);

  return {
    count: results.length,
    avgScore: sum / results.length,
    maxScore: Math.max(...scores),
    minScore: Math.min(...scores),
  };
}
