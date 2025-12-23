/**
 * Конфигурация LLM моделей
 * 
 * Поддерживаемые провайдеры:
 * - Anthropic Claude
 * - DeepSeek
 */

// Провайдер по умолчанию
export const DEFAULT_PROVIDER = 'deepseek'; // 'anthropic' или 'deepseek'

// ============================================
// DeepSeek Models (рекомендуется!)
// ============================================
export const DEEPSEEK_MODELS = {
  'deepseek-chat': {
    name: 'DeepSeek Chat',
    description: 'Основная модель DeepSeek, очень мощная',
    context: 64000,
    pricing: { input: 0.14, output: 0.28 }, // $ за 1M токенов (в 10 раз дешевле Claude!)
  },
  'deepseek-reasoner': {
    name: 'DeepSeek Reasoner',
    description: 'Модель с глубоким рассуждением (как o1)',
    context: 64000,
    pricing: { input: 0.55, output: 2.19 },
  },
};

// ============================================
// Anthropic Claude Models
// ============================================
export const CLAUDE_MODELS = {
  'claude-3-5-sonnet-20240620': {
    name: 'Claude 3.5 Sonnet (June 2024)',
    description: 'Стабильная версия',
    context: 200000,
    pricing: { input: 3, output: 15 },
  },
  'claude-3-sonnet-20240229': {
    name: 'Claude 3 Sonnet',
    description: 'Баланс скорости и качества',
    context: 200000,
    pricing: { input: 3, output: 15 },
  },
  'claude-3-haiku-20240307': {
    name: 'Claude 3 Haiku',
    description: 'Самая быстрая и дешёвая',
    context: 200000,
    pricing: { input: 0.25, output: 1.25 },
  },
  'claude-3-opus-20240229': {
    name: 'Claude 3 Opus',
    description: 'Самая умная модель',
    context: 200000,
    pricing: { input: 15, output: 75 },
  },
};

// Все доступные модели
export const AVAILABLE_MODELS = {
  ...DEEPSEEK_MODELS,
  ...CLAUDE_MODELS,
};

// API URLs
export const API_URLS = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
};

/**
 * Получить конфигурацию провайдера
 */
export function getProviderConfig() {
  const provider = process.env.LLM_PROVIDER || DEFAULT_PROVIDER;
  
  if (provider === 'deepseek') {
    return {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      apiUrl: API_URLS.deepseek,
      defaultModel: 'deepseek-chat',
      models: DEEPSEEK_MODELS,
    };
  } else if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      apiUrl: API_URLS.anthropic,
      defaultModel: 'claude-3-5-sonnet-20240620',
      models: CLAUDE_MODELS,
    };
  }
  
  throw new Error(`Неизвестный провайдер: ${provider}`);
}

/**
 * Получить название модели
 */
export function getModelName(): string {
  const config = getProviderConfig();
  
  // Если модель указана в .env - используем её
  const envModel = process.env.LLM_MODEL;
  if (envModel) {
    console.log(`[Config] Используется модель из .env: ${envModel}`);
    return envModel;
  }
  
  console.log(`[Config] Используется модель по умолчанию: ${config.defaultModel}`);
  return config.defaultModel;
}

/**
 * Проверить доступность модели
 */
export function isModelAvailable(modelName: string): boolean {
  return modelName in AVAILABLE_MODELS;
}

/**
 * Получить информацию о модели
 */
export function getModelInfo(modelName: string) {
  return AVAILABLE_MODELS[modelName as keyof typeof AVAILABLE_MODELS];
}

/**
 * Список всех доступных моделей
 */
export function listAvailableModels() {
  return Object.entries(AVAILABLE_MODELS).map(([id, info]) => ({
    id,
    ...info,
  }));
}
