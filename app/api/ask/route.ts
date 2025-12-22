import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { generateEmbedding } from '@/lib/embeddings';
import { findMostSimilar, filterByMinScore } from '@/lib/similarity';
import { SearchIndex } from '@/lib/types';
import { askDeepSeek, createContextualPrompt } from '@/lib/deepseek';

const INDEX_FILE = path.join(process.cwd(), 'data', 'index.json');

/**
 * POST /api/ask
 * Отвечает на вопросы используя DeepSeek и индексированные документы
 *
 * Body: {
 *   question: string,      // Вопрос пользователя
 *   top_k?: number,        // Количество документов для контекста (по умолчанию 5)
 *   min_score?: number     // Минимальный порог релевантности (по умолчанию 0.2)
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Парсинг тела запроса
    const body = await request.json();
    const { question, top_k = 5, min_score = 0.2 } = body;

    // Валидация
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        { error: 'Параметр "question" обязателен и должен быть непустой строкой' },
        { status: 400 }
      );
    }

    if (typeof top_k !== 'number' || top_k < 1 || top_k > 20) {
      return NextResponse.json(
        { error: 'Параметр "top_k" должен быть числом от 1 до 20' },
        { status: 400 }
      );
    }

    if (typeof min_score !== 'number' || min_score < 0 || min_score > 1) {
      return NextResponse.json(
        { error: 'Параметр "min_score" должен быть числом от 0 до 1' },
        { status: 400 }
      );
    }

    console.log(`[API Ask] Вопрос: "${question}" (top_k=${top_k}, min_score=${min_score})`);

    // Проверяем DEEPSEEK_API_KEY
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json(
        {
          error: 'DeepSeek API ключ не настроен. Добавьте DEEPSEEK_API_KEY в переменные окружения.',
        },
        { status: 500 }
      );
    }

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
    console.log('[API Ask] Загрузка индекса...');
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

    // Генерируем эмбеддинг для вопроса
    console.log('[API Ask] Генерация эмбеддинга для вопроса...');
    const questionEmbedding = await generateEmbedding(question);

    // Поиск наиболее релевантных фрагментов
    console.log('[API Ask] Поиск релевантных фрагментов...');
    let relevantChunks = findMostSimilar(questionEmbedding, searchIndex.chunks, top_k);
    relevantChunks = filterByMinScore(relevantChunks, min_score);

    if (relevantChunks.length === 0) {
      return NextResponse.json({
        success: true,
        question,
        answer: 'К сожалению, я не нашел релевантной информации в документах для ответа на ваш вопрос. Попробуйте переформулировать вопрос или убедитесь, что нужные документы проиндексированы.',
        context: [],
        stats: {
          context_chunks: 0,
          duration_seconds: ((Date.now() - startTime) / 1000).toFixed(3),
        },
      });
    }

    // Подготовка контекста для DeepSeek
    const context = relevantChunks.map(chunk => ({
      text: chunk.text,
      source: chunk.source,
      score: chunk.score,
    }));

    console.log(`[API Ask] Найдено ${context.length} релевантных фрагментов`);

    // Создаем промпт с контекстом
    const messages = createContextualPrompt(question, context);

    // Получаем ответ от DeepSeek
    console.log('[API Ask] Запрос к DeepSeek API...');
    const answer = await askDeepSeek(messages);

    const duration = ((Date.now() - startTime) / 1000).toFixed(3);

    console.log(`[API Ask] Ответ получен за ${duration}s`);

    return NextResponse.json({
      success: true,
      question,
      answer,
      context: context.map((c, index) => ({
        index: index + 1,
        text: c.text.substring(0, 200) + (c.text.length > 200 ? '...' : ''),
        source: c.source,
        score: parseFloat(c.score.toFixed(4)),
      })),
      stats: {
        context_chunks: context.length,
        duration_seconds: parseFloat(duration),
      },
    });
  } catch (error: any) {
    console.error('[API Ask] Ошибка:', error);
    return NextResponse.json(
      {
        error: 'Ошибка при обработке вопроса',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ask
 * Возвращает информацию о доступных параметрах
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/ask',
    method: 'POST',
    description: 'Отвечает на вопросы используя DeepSeek AI и индексированные документы',
    parameters: {
      question: {
        type: 'string',
        required: true,
        description: 'Вопрос пользователя',
      },
      top_k: {
        type: 'number',
        required: false,
        default: 5,
        min: 1,
        max: 20,
        description: 'Количество документов для контекста',
      },
      min_score: {
        type: 'number',
        required: false,
        default: 0.2,
        min: 0,
        max: 1,
        description: 'Минимальный порог релевантности',
      },
    },
    example: {
      question: 'Что такое семантический поиск?',
      top_k: 5,
      min_score: 0.2,
    },
    note: 'Требуется настроенный DEEPSEEK_API_KEY в переменных окружения',
  });
}
