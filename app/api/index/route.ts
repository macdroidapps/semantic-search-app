import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { processAllDocuments } from '@/lib/chunking';
import { generateEmbeddings, getModelInfo } from '@/lib/embeddings';
import { SearchIndex, IndexedChunk } from '@/lib/types';

// Пути к данным
const DOCUMENTS_DIR = path.join(process.cwd(), 'data', 'documents');
const INDEX_FILE = path.join(process.cwd(), 'data', 'index.json');

/**
 * POST /api/index
 * Индексирует все markdown документы из папки /data/documents
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('[API Index] Начало индексации...');

    // Проверяем существование директории с документами
    try {
      await fs.access(DOCUMENTS_DIR);
    } catch {
      return NextResponse.json(
        { error: `Директория ${DOCUMENTS_DIR} не найдена. Создайте её и добавьте .md файлы` },
        { status: 404 }
      );
    }

    // Шаг 1: Разбивка документов на чанки
    console.log('[API Index] Шаг 1: Разбивка документов на чанки...');
    const chunks = await processAllDocuments(DOCUMENTS_DIR);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'Не найдено документов для индексации. Добавьте .md файлы в /data/documents' },
        { status: 400 }
      );
    }

    // Шаг 2: Генерация эмбеддингов
    console.log('[API Index] Шаг 2: Генерация эмбеддингов...');
    const texts = chunks.map(chunk => chunk.text);
    const embeddings = await generateEmbeddings(texts);

    // Шаг 3: Создание индекса
    console.log('[API Index] Шаг 3: Создание индекса...');
    const indexedChunks: IndexedChunk[] = chunks.map((chunk, index) => ({
      id: chunk.id,
      text: chunk.text,
      source: chunk.source,
      embedding: embeddings[index],
      metadata: chunk.metadata,
    }));

    // Сбор уникальных имён файлов
    const uniqueDocuments = Array.from(new Set(chunks.map(c => c.source)));

    // Шаг 4: Сохранение индекса
    console.log('[API Index] Шаг 4: Сохранение индекса...');
    const modelInfo = getModelInfo();
    const searchIndex: SearchIndex = {
      chunks: indexedChunks,
      metadata: {
        model: modelInfo.name,
        indexed_at: new Date().toISOString(),
        total_chunks: indexedChunks.length,
        total_documents: uniqueDocuments.length,
        documents: uniqueDocuments,
      },
    };

    // Создаём директорию data, если её нет
    const dataDir = path.join(process.cwd(), 'data');
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    await fs.writeFile(INDEX_FILE, JSON.stringify(searchIndex, null, 2), 'utf-8');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('[API Index] Индексация завершена успешно');

    return NextResponse.json({
      success: true,
      message: 'Индексация завершена успешно',
      stats: {
        total_chunks: indexedChunks.length,
        total_documents: uniqueDocuments.length,
        documents: uniqueDocuments,
        model: modelInfo.name,
        duration_seconds: parseFloat(duration),
        indexed_at: searchIndex.metadata.indexed_at,
      },
    });
  } catch (error: any) {
    console.error('[API Index] Ошибка индексации:', error);
    return NextResponse.json(
      {
        error: 'Ошибка при индексации документов',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/index
 * Возвращает информацию о текущем индексе
 */
export async function GET() {
  try {
    // Проверяем существование индекса
    try {
      await fs.access(INDEX_FILE);
    } catch {
      return NextResponse.json(
        {
          exists: false,
          message: 'Индекс не создан. Запустите POST /api/index для индексации документов',
        },
        { status: 404 }
      );
    }

    // Читаем индекс
    const indexData = await fs.readFile(INDEX_FILE, 'utf-8');
    const searchIndex: SearchIndex = JSON.parse(indexData);

    return NextResponse.json({
      exists: true,
      metadata: searchIndex.metadata,
    });
  } catch (error: any) {
    console.error('[API Index] Ошибка чтения индекса:', error);
    return NextResponse.json(
      {
        error: 'Ошибка при чтении индекса',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
