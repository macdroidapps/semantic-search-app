/**
 * Библиотека для работы с DeepSeek API
 * DeepSeek использует OpenAI-совместимый API
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekRequest {
  model?: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Отправляет запрос к DeepSeek API
 * @param messages - Массив сообщений для чата
 * @param options - Дополнительные опции
 * @returns Ответ от DeepSeek
 */
export async function askDeepSeek(
  messages: DeepSeekMessage[],
  options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  } = {}
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY не найден в переменных окружения');
  }

  const requestBody: DeepSeekRequest = {
    model: options.model || DEFAULT_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2000,
    stream: false,
  };

  try {
    console.log('[DeepSeek] Отправка запроса к API...');

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `DeepSeek API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`
      );
    }

    const data: DeepSeekResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('DeepSeek API вернул пустой ответ');
    }

    const answer = data.choices[0].message.content;

    console.log('[DeepSeek] Ответ получен');
    console.log('[DeepSeek] Использовано токенов:', data.usage.total_tokens);

    return answer;
  } catch (error: any) {
    console.error('[DeepSeek] Ошибка запроса:', error);
    throw new Error(`Не удалось получить ответ от DeepSeek: ${error.message}`);
  }
}

/**
 * Создает запрос с контекстом из индексированных документов
 * @param question - Вопрос пользователя
 * @param context - Релевантные фрагменты из документов
 * @returns Массив сообщений для DeepSeek
 */
export function createContextualPrompt(
  question: string,
  context: Array<{ text: string; source: string; score: number }>
): DeepSeekMessage[] {
  // Системный промпт с инструкциями
  const systemPrompt = `Ты - AI ассистент, который отвечает на вопросы на основе предоставленных документов.

ВАЖНО:
- Отвечай только на основе предоставленного контекста
- Если информации недостаточно для полного ответа, так и скажи
- Используй цитаты из документов, когда это уместно
- Указывай источники информации
- Отвечай на русском языке, если вопрос на русском
- Будь точным и конкретным`;

  // Формируем контекст из найденных документов
  const contextText = context
    .map((item, index) => {
      return `[Документ ${index + 1}: ${item.source}] (релевантность: ${(item.score * 100).toFixed(1)}%)
${item.text}`;
    })
    .join('\n\n---\n\n');

  // Формируем сообщение пользователя с контекстом
  const userMessage = `Контекст из документов:

${contextText}

---

Вопрос: ${question}

Ответь на вопрос, используя информацию из предоставленных документов выше.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Получает информацию о модели
 */
export function getDeepSeekInfo() {
  return {
    model: DEFAULT_MODEL,
    api_url: DEEPSEEK_API_URL,
    description: 'DeepSeek Chat - мощная языковая модель для ответов на вопросы',
  };
}
