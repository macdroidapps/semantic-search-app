/**
 * Модуль для работы с LLM API (DeepSeek, Claude)
 * Поддерживает несколько провайдеров
 */

import { getModelName, getProviderConfig } from './config';

/**
 * Интерфейс для параметров запроса
 */
interface LLMRequestParams {
  question: string;      // Вопрос пользователя
  context?: string;      // Дополнительный контекст (для RAG)
  systemPrompt?: string; // Системный промпт (опционально)
  maxTokens?: number;    // Максимум токенов в ответе
}

/**
 * Интерфейс для ответа
 */
interface LLMResponse {
  answer: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Проверяет наличие API ключа
 */
function checkApiKey(apiKey: string | undefined, provider: string): void {
  if (!apiKey) {
    const errorMessage = `
❌ ${provider.toUpperCase()}_API_KEY не установлен!

Чтобы использовать RAG функционал:

${provider === 'deepseek' ? `
1. Получите API ключ на https://platform.deepseek.com/
2. Создайте файл .env.local в корне проекта
3. Добавьте строку: DEEPSEEK_API_KEY=ваш-ключ
4. Перезапустите сервер (npm run dev)
` : `
1. Получите API ключ на https://console.anthropic.com/
2. Создайте файл .env.local в корне проекта
3. Добавьте строку: ANTHROPIC_API_KEY=sk-ant-ваш-ключ
4. Перезапустите сервер (npm run dev)
`}

Или используйте только режим "Поиск" (не RAG).
    `.trim();
    
    throw new Error(errorMessage);
  }
}

/**
 * Запрос к DeepSeek API
 */
async function callDeepSeek({
  question,
  context,
  systemPrompt,
  maxTokens = 2000,
  apiKey,
  apiUrl,
  model,
}: LLMRequestParams & { apiKey: string; apiUrl: string; model: string }): Promise<LLMResponse> {
  // Формируем сообщения
  const messages: any[] = [];
  
  // Системное сообщение
  const defaultSystemPrompt = 'Ты полезный AI-ассистент. Отвечай точно, структурированно и по делу.';
  const finalSystemPrompt = systemPrompt || defaultSystemPrompt;
  
  messages.push({
    role: 'system',
    content: finalSystemPrompt,
  });
  
  // Пользовательское сообщение
  let userMessage: string;
  
  if (context) {
    userMessage = `На основе следующего контекста из документов, ответь на вопрос пользователя.

КОНТЕКСТ ИЗ ДОКУМЕНТОВ:
${context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ:
${question}

ИНСТРУКЦИИ:
- Используй информацию из контекста для ответа
- Если информация есть в контексте - отвечай на основе её
- Если информации нет в контексте - честно скажи об этом
- Отвечай по-русски, структурированно и понятно`;
  } else {
    userMessage = question;
  }
  
  messages.push({
    role: 'user',
    content: userMessage,
  });

  console.log('[LLM] Отправка запроса к DeepSeek API...');
  console.log('[LLM] Модель:', model);
  console.log('[LLM] Вопрос:', question.substring(0, 100) + '...');
  console.log('[LLM] Контекст:', context ? 'Да' : 'Нет');

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[LLM] Ошибка DeepSeek API:', response.status, errorData);
      throw new Error(
        `DeepSeek API error: ${response.status} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();

    console.log('[LLM] Ответ получен');
    console.log('[LLM] Использовано токенов:', data.usage?.prompt_tokens || 0, '+', data.usage?.completion_tokens || 0);

    const answer = data.choices?.[0]?.message?.content || '';

    return {
      answer,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      },
    };
  } catch (error) {
    console.error('[LLM] Ошибка при запросе к DeepSeek:', error);
    throw new Error(
      `Не удалось получить ответ от DeepSeek: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Запрос к Claude API (Anthropic)
 */
async function callClaude({
  question,
  context,
  systemPrompt,
  maxTokens = 2000,
  apiKey,
  apiUrl,
  model,
}: LLMRequestParams & { apiKey: string; apiUrl: string; model: string }): Promise<LLMResponse> {
  // Формируем промпт
  let userMessage: string;

  if (context) {
    userMessage = `На основе следующего контекста из документов, ответь на вопрос пользователя.

КОНТЕКСТ ИЗ ДОКУМЕНТОВ:
${context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ:
${question}

ИНСТРУКЦИИ:
- Используй информацию из контекста для ответа
- Если информация есть в контексте - отвечай на основе её
- Если информации нет в контексте - честно скажи об этом
- Отвечай по-русски, структурированно и понятно`;
  } else {
    userMessage = question;
  }

  const defaultSystemPrompt = 'Ты полезный AI-ассистент. Отвечай точно, структурированно и по делу.';

  console.log('[LLM] Отправка запроса к Claude API...');
  console.log('[LLM] Модель:', model);
  console.log('[LLM] Вопрос:', question.substring(0, 100) + '...');
  console.log('[LLM] Контекст:', context ? 'Да' : 'Нет');

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        system: systemPrompt || defaultSystemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[LLM] Ошибка Claude API:', response.status, errorData);
      throw new Error(
        `Claude API error: ${response.status} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();

    console.log('[LLM] Ответ получен');
    console.log('[LLM] Использовано токенов:', data.usage.input_tokens, '+', data.usage.output_tokens);

    const answer = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n');

    return {
      answer,
      usage: data.usage,
    };
  } catch (error) {
    console.error('[LLM] Ошибка при запросе к Claude:', error);
    throw new Error(
      `Не удалось получить ответ от Claude: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Основная функция для отправки запроса к LLM
 */
export async function askLLM(params: LLMRequestParams): Promise<LLMResponse> {
  const config = getProviderConfig();
  const model = getModelName();
  
  checkApiKey(config.apiKey, config.provider);
  
  const requestParams = {
    ...params,
    apiKey: config.apiKey!,
    apiUrl: config.apiUrl,
    model,
  };
  
  if (config.provider === 'deepseek') {
    return callDeepSeek(requestParams);
  } else if (config.provider === 'anthropic') {
    return callClaude(requestParams);
  }
  
  throw new Error(`Неизвестный провайдер: ${config.provider}`);
}

// Для обратной совместимости
export const askClaude = askLLM;

/**
 * Упрощённая функция - просто задать вопрос без контекста
 */
export async function askLLMSimple(question: string): Promise<string> {
  const result = await askLLM({ question });
  return result.answer;
}

/**
 * Функция для RAG режима - вопрос + контекст из документов
 */
export async function askLLMWithRAG(
  question: string,
  context: string
): Promise<string> {
  const result = await askLLM({ question, context });
  return result.answer;
}

/**
 * Получить информацию о модели
 */
export function getModelInfo() {
  const config = getProviderConfig();
  const model = getModelName();
  
  return {
    provider: config.provider,
    model: model,
    description: `${config.provider === 'deepseek' ? 'DeepSeek' : 'Claude'} - ${model}`,
  };
}

/**
 * Проверить доступность API
 */
export async function checkApiAvailability(): Promise<boolean> {
  try {
    const config = getProviderConfig();
    checkApiKey(config.apiKey, config.provider);
    
    // Простой тестовый запрос
    await askLLM({
      question: 'Hello',
      maxTokens: 10,
    });
    
    return true;
  } catch (error) {
    console.error('[LLM] API недоступен:', error);
    return false;
  }
}
