import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const INDEX_FILE = path.join(process.cwd(), 'data', 'index.json');

/**
 * GET /api/rag/status
 * Проверка статуса RAG системы и её компонентов
 */
export async function GET() {
  const status: any = {
    timestamp: new Date().toISOString(),
    components: {},
    errors: [],
    warnings: [],
    ready: true,
  };

  // 1. Проверка API ключа
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  status.components.anthropic_api = {
    configured: hasApiKey,
    status: hasApiKey ? 'ready' : 'not_configured',
  };

  if (!hasApiKey) {
    status.ready = false;
    status.errors.push({
      component: 'anthropic_api',
      message: 'ANTHROPIC_API_KEY не установлен',
      solution: 'Создайте .env.local файл и добавьте: ANTHROPIC_API_KEY=sk-ant-ваш-ключ',
      docs: 'https://console.anthropic.com/',
    });
  }

  // 2. Проверка индекса
  let indexExists = false;
  let indexData: any = null;

  try {
    await fs.access(INDEX_FILE);
    const indexContent = await fs.readFile(INDEX_FILE, 'utf-8');
    indexData = JSON.parse(indexContent);
    indexExists = true;

    status.components.search_index = {
      exists: true,
      status: 'ready',
      metadata: {
        total_chunks: indexData.chunks?.length || 0,
        total_documents: indexData.metadata?.total_documents || 0,
        model: indexData.metadata?.model || 'unknown',
        indexed_at: indexData.metadata?.indexed_at || 'unknown',
      },
    };

    if (indexData.chunks?.length === 0) {
      status.warnings.push({
        component: 'search_index',
        message: 'Индекс пустой - нет документов',
        solution: 'Добавьте .md файлы в data/documents/ и нажмите "Переиндексировать"',
      });
    }
  } catch (error) {
    indexExists = false;
    status.components.search_index = {
      exists: false,
      status: 'not_created',
    };

    status.warnings.push({
      component: 'search_index',
      message: 'Индекс не создан',
      solution: 'Нажмите кнопку "Переиндексировать" в UI или вызовите POST /api/index',
    });
  }

  // 3. Проверка документов
  const documentsDir = path.join(process.cwd(), 'data', 'documents');
  let documentsExist = false;
  let documentCount = 0;

  try {
    const files = await fs.readdir(documentsDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    documentCount = mdFiles.length;
    documentsExist = mdFiles.length > 0;

    status.components.documents = {
      exists: documentsExist,
      status: documentsExist ? 'ready' : 'empty',
      count: documentCount,
      location: '/data/documents/',
    };

    if (!documentsExist) {
      status.warnings.push({
        component: 'documents',
        message: 'Нет документов для индексации',
        solution: 'Добавьте .md файлы в папку data/documents/',
      });
    }
  } catch (error) {
    status.components.documents = {
      exists: false,
      status: 'error',
      error: 'Папка data/documents не найдена',
    };

    status.errors.push({
      component: 'documents',
      message: 'Папка с документами не найдена',
      solution: 'Создайте папку data/documents/ в корне проекта',
    });
  }

  // 4. Общий статус готовности
  const canUseSearch = indexExists && indexData?.chunks?.length > 0;
  const canUseRAG = hasApiKey && canUseSearch;

  status.features = {
    search: {
      available: canUseSearch,
      description: 'Семантический поиск по документам',
    },
    rag_with_context: {
      available: canUseRAG,
      description: 'AI ответы на основе документов',
    },
    rag_without_context: {
      available: hasApiKey,
      description: 'AI ответы из общих знаний',
    },
    compare: {
      available: canUseRAG,
      description: 'Сравнение режимов с RAG и без RAG',
    },
  };

  // 5. Рекомендации
  status.recommendations = [];

  if (!hasApiKey) {
    status.recommendations.push({
      priority: 'high',
      message: 'Настройте ANTHROPIC_API_KEY для использования RAG',
      action: 'Получите ключ на https://console.anthropic.com/ и добавьте в .env.local',
    });
  }

  if (!indexExists) {
    status.recommendations.push({
      priority: 'high',
      message: 'Создайте индекс документов',
      action: 'Нажмите "Переиндексировать" или вызовите POST /api/index',
    });
  }

  if (!documentsExist) {
    status.recommendations.push({
      priority: 'medium',
      message: 'Добавьте документы для индексации',
      action: 'Поместите .md файлы в data/documents/',
    });
  }

  if (canUseRAG) {
    status.recommendations.push({
      priority: 'low',
      message: 'Всё готово! Можете использовать все функции',
      action: 'Попробуйте режим "Сравнение" для оценки RAG',
    });
  }

  // Определяем HTTP статус
  const httpStatus = status.errors.length > 0 ? 500 : 200;

  return NextResponse.json(status, { status: httpStatus });
}

/**
 * POST /api/rag/status
 * Тестовый запрос для проверки RAG без реального использования
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { test_mode = 'check' } = body;

    if (test_mode === 'check') {
      // Просто проверяем что API ключ есть
      const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

      if (!hasApiKey) {
        return NextResponse.json(
          {
            success: false,
            error: 'ANTHROPIC_API_KEY не настроен',
            message: 'Для использования RAG нужен API ключ Claude',
            instructions: [
              '1. Зайдите на https://console.anthropic.com/',
              '2. Создайте API ключ',
              '3. Создайте .env.local в корне проекта',
              '4. Добавьте: ANTHROPIC_API_KEY=sk-ant-ваш-ключ',
              '5. Перезапустите сервер: npm run dev',
            ],
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'API ключ настроен, RAG готов к работе!',
        api_key_configured: true,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Неизвестный режим тестирования',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
