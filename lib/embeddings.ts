import { pipeline, env } from '@xenova/transformers';

// Настройка для работы в Node.js окружении
env.allowLocalModels = false;
env.useBrowserCache = false;

// Кэш для модели эмбеддингов
let embeddingPipeline: any = null;

/**
 * Модель для генерации эмбеддингов
 * all-MiniLM-L6-v2 - быстрая модель с хорошей поддержкой многоязычности
 */
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/**
 * Инициализирует pipeline для генерации эмбеддингов
 * Модель кэшируется после первой загрузки
 */
async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('[Embeddings] Загрузка модели:', MODEL_NAME);
    embeddingPipeline = await pipeline('feature-extraction', MODEL_NAME);
    console.log('[Embeddings] Модель загружена успешно');
  }
  return embeddingPipeline;
}

/**
 * Нормализует вектор (приводит к единичной длине)
 * Необходимо для корректного вычисления косинусного сходства
 */
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
}

/**
 * Генерирует эмбеддинг для текста
 * @param text - Входной текст
 * @returns Нормализованный вектор эмбеддинга (размерность 384)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Текст для эмбеддинга не может быть пустым');
  }

  try {
    const pipe = await getEmbeddingPipeline();
    
    // Генерация эмбеддинга
    const output = await pipe(text, {
      pooling: 'mean',
      normalize: false, // Нормализуем вручную для контроля
    });

    // Извлечение данных из тензора
    const embedding = Array.from(output.data) as number[];
    
    // Нормализация вектора
    const normalized = normalizeVector(embedding);
    
    return normalized;
  } catch (error) {
    console.error('[Embeddings] Ошибка генерации эмбеддинга:', error);
    throw new Error(`Не удалось сгенерировать эмбеддинг: ${error}`);
  }
}

/**
 * Генерирует эмбеддинги для массива текстов
 * @param texts - Массив текстов
 * @returns Массив нормализованных векторов
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  console.log(`[Embeddings] Генерация эмбеддингов для ${texts.length} текстов...`);
  
  const embeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i++) {
    const embedding = await generateEmbedding(texts[i]);
    embeddings.push(embedding);
    
    // Логирование прогресса
    if ((i + 1) % 10 === 0 || i === texts.length - 1) {
      console.log(`[Embeddings] Обработано: ${i + 1}/${texts.length}`);
    }
  }
  
  return embeddings;
}

/**
 * Получает информацию о модели
 */
export function getModelInfo() {
  return {
    name: MODEL_NAME,
    dimension: 384, // Размерность векторов для этой модели
    description: 'Многоязычная модель для семантического поиска',
  };
}
