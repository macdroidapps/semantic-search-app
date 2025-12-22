import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface TextChunk {
  id: string;
  text: string;
  source: string;
  metadata?: {
    position: number;
    totalChunks: number;
  };
}

/**
 * Конфигурация для разбивки текста
 */
export interface ChunkingConfig {
  chunkSize: number;    // Размер чанка в символах
  overlap: number;      // Перекрытие между чанками
  minChunkSize: number; // Минимальный размер чанка
}

const DEFAULT_CONFIG: ChunkingConfig = {
  chunkSize: 500,
  overlap: 50,
  minChunkSize: 100,
};

/**
 * Читает все .md файлы из указанной директории
 * @param directoryPath - Путь к директории с документами
 * @returns Массив объектов {filename, content}
 */
export async function readMarkdownFiles(directoryPath: string): Promise<Array<{ filename: string; content: string }>> {
  try {
    const files = await fs.readdir(directoryPath);
    const mdFiles = files.filter(file => file.endsWith('.md'));

    if (mdFiles.length === 0) {
      console.warn(`[Chunking] Не найдено .md файлов в ${directoryPath}`);
      return [];
    }

    console.log(`[Chunking] Найдено ${mdFiles.length} .md файлов`);

    const filesContent = await Promise.all(
      mdFiles.map(async (filename) => {
        const filePath = path.join(directoryPath, filename);
        const content = await fs.readFile(filePath, 'utf-8');
        return { filename, content };
      })
    );

    return filesContent;
  } catch (error) {
    console.error('[Chunking] Ошибка чтения файлов:', error);
    throw new Error(`Не удалось прочитать файлы из ${directoryPath}: ${error}`);
  }
}

/**
 * Умная разбивка текста на предложения
 * Учитывает сокращения и специальные случаи
 */
function splitIntoSentences(text: string): string[] {
  // Базовая разбивка по знакам препинания
  const sentences = text
    .replace(/\n+/g, ' ') // Убираем переносы строк
    .split(/(?<=[.!?])\s+/) // Разделяем по точке, вопросу, восклицанию
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return sentences;
}

/**
 * Разбивает текст на чанки с перекрытием
 * @param text - Исходный текст
 * @param config - Конфигурация разбивки
 * @returns Массив чанков текста
 */
function splitTextIntoChunks(text: string, config: ChunkingConfig = DEFAULT_CONFIG): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;

    if (potentialChunk.length <= config.chunkSize) {
      // Добавляем предложение к текущему чанку
      currentChunk = potentialChunk;
    } else {
      // Текущий чанк заполнен, сохраняем его
      if (currentChunk.length >= config.minChunkSize) {
        chunks.push(currentChunk);
      }

      // Начинаем новый чанк с учётом overlap
      if (config.overlap > 0 && currentChunk.length > config.overlap) {
        const overlapText = currentChunk.slice(-config.overlap);
        currentChunk = overlapText + ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
    }
  }

  // Добавляем последний чанк
  if (currentChunk.length >= config.minChunkSize) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Обрабатывает файл: разбивает на чанки и добавляет метаданные
 * @param filename - Имя файла
 * @param content - Содержимое файла
 * @param config - Конфигурация разбивки
 * @returns Массив чанков с метаданными
 */
export function processDocument(
  filename: string,
  content: string,
  config: ChunkingConfig = DEFAULT_CONFIG
): TextChunk[] {
  const textChunks = splitTextIntoChunks(content, config);
  const totalChunks = textChunks.length;

  return textChunks.map((text, index) => ({
    id: uuidv4(),
    text,
    source: filename,
    metadata: {
      position: index + 1,
      totalChunks,
    },
  }));
}

/**
 * Обрабатывает все документы из директории
 * @param directoryPath - Путь к директории с документами
 * @param config - Конфигурация разбивки
 * @returns Массив всех чанков со всех документов
 */
export async function processAllDocuments(
  directoryPath: string,
  config: ChunkingConfig = DEFAULT_CONFIG
): Promise<TextChunk[]> {
  const files = await readMarkdownFiles(directoryPath);
  const allChunks: TextChunk[] = [];

  for (const { filename, content } of files) {
    console.log(`[Chunking] Обработка файла: ${filename}`);
    const chunks = processDocument(filename, content, config);
    console.log(`[Chunking] Создано ${chunks.length} чанков из ${filename}`);
    allChunks.push(...chunks);
  }

  console.log(`[Chunking] Всего создано ${allChunks.length} чанков из ${files.length} файлов`);
  return allChunks;
}
