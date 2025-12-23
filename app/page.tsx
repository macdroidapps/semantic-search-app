'use client';

import { useState, useEffect } from 'react';

interface SearchResult {
  id: string;
  text: string;
  source: string;
  score: number;
  metadata?: {
    position: number;
    totalChunks: number;
  };
}

interface IndexInfo {
  exists: boolean;
  metadata?: {
    model: string;
    indexed_at: string;
    total_chunks: number;
    total_documents: number;
    documents: string[];
  };
}

interface RAGAnswer {
  answer: string;
  mode: string;
  sources?: any;
  context_quality?: any;
  llm_usage?: any;
}

type ViewMode = 'search' | 'rag' | 'compare';

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexInfo, setIndexInfo] = useState<IndexInfo | null>(null);
  const [error, setError] = useState('');
  const [searchStats, setSearchStats] = useState<any>(null);
  
  // RAG состояния
  const [viewMode, setViewMode] = useState<ViewMode>('rag');
  const [useRAG, setUseRAG] = useState(true);
  const [ragAnswer, setRagAnswer] = useState<RAGAnswer | null>(null);
  const [compareResults, setCompareResults] = useState<any>(null);
  const [ragStatus, setRagStatus] = useState<any>(null);

  const fetchIndexInfo = async () => {
    try {
      const response = await fetch('/api/index');
      const data = await response.json();
      setIndexInfo(data);
    } catch (err) {
      console.error('Ошибка загрузки информации об индексе:', err);
    }
  };

  const fetchRAGStatus = async () => {
    try {
      const response = await fetch('/api/rag/status');
      const data = await response.json();
      setRagStatus(data);
      console.log('[RAG Status]', data);
    } catch (err) {
      console.error('Ошибка загрузки статуса RAG:', err);
    }
  };

  // Загрузка информации об индексе при монтировании
  useEffect(() => {
    fetchIndexInfo();
    fetchRAGStatus();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResults([]);
    setSearchStats(null);
    setRagAnswer(null);
    setCompareResults(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, top_k: 10, min_score: 0.2 }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Ошибка поиска');
        return;
      }

      setResults(data.results);
      setSearchStats(data.stats);
    } catch (err: any) {
      setError('Ошибка соединения с сервером: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRAGQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setRagAnswer(null);
    setResults([]);
    setCompareResults(null);

    try {
      const response = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          useRAG, 
          top_k: 5,
          min_score: 0.3 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Ошибка RAG запроса');
        if (data.help) {
          setError(prev => prev + '\n' + data.help);
        }
        return;
      }

      setRagAnswer(data);
    } catch (err: any) {
      setError('Ошибка соединения: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setCompareResults(null);
    setRagAnswer(null);
    setResults([]);

    try {
      const response = await fetch('/api/rag/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          top_k: 5,
          min_score: 0.3 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Ошибка сравнения');
        return;
      }

      setCompareResults(data);
    } catch (err: any) {
      setError('Ошибка соединения: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIndex = async () => {
    if (!confirm('Запустить переиндексацию документов? Это может занять несколько минут.')) {
      return;
    }

    setIndexing(true);
    setError('');

    try {
      const response = await fetch('/api/index', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Ошибка индексации');
        return;
      }

      alert(`Индексация завершена!\n\nДокументов: ${data.stats.total_documents}\nЧанков: ${data.stats.total_chunks}\nВремя: ${data.stats.duration_seconds}s`);
      await fetchIndexInfo();
    } catch (err: any) {
      setError('Ошибка соединения с сервером: ' + err.message);
    } finally {
      setIndexing(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            🤖 RAG Semantic Search
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Поиск + AI: сравните режимы с RAG и без RAG
          </p>
        </div>

        {/* Переключатель режимов */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setViewMode('search')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'search'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
              }`}
            >
              🔍 Поиск
            </button>
            <button
              onClick={() => setViewMode('rag')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'rag'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
              }`}
            >
              🤖 RAG режим
            </button>
            <button
              onClick={() => setViewMode('compare')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'compare'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
              }`}
            >
              ⚖️ Сравнение
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">
            {viewMode === 'search' && 'Семантический поиск по документам'}
            {viewMode === 'rag' && 'Вопрос-ответ с использованием AI'}
            {viewMode === 'compare' && 'Сравните ответы: с RAG vs без RAG'}
          </p>
        </div>

        {/* Информация об индексе */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Статус индекса
              </h2>
              {indexInfo?.exists ? (
                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  <p>✅ Индекс создан</p>
                  <p>📄 Документов: {indexInfo.metadata?.total_documents}</p>
                  <p>📝 Чанков: {indexInfo.metadata?.total_chunks}</p>
                  <p>🤖 Модель: {indexInfo.metadata?.model}</p>
                  <p className="text-xs mt-2 text-gray-500">
                    Обновлён: {indexInfo.metadata?.indexed_at ? new Date(indexInfo.metadata.indexed_at).toLocaleString('ru-RU') : 'N/A'}
                  </p>
                </div>
              ) : (
                <p className="text-yellow-600 dark:text-yellow-400">
                  ⚠️ Индекс не создан. Нажмите кнопку индексации.
                </p>
              )}
            </div>
            <button
              onClick={handleIndex}
              disabled={indexing}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {indexing ? '⏳ Индексация...' : '🔄 Переиндексировать'}
            </button>
          </div>
        </div>

        {/* Форма поиска/запроса */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={
            viewMode === 'search' ? handleSearch :
            viewMode === 'rag' ? handleRAGQuery :
            handleCompare
          } className="space-y-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {viewMode === 'search' ? 'Поисковый запрос' : 'Ваш вопрос'}
              </label>
              <input
                id="search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  viewMode === 'search' 
                    ? "Введите ключевые слова..." 
                    : "Задайте вопрос по документам..."
                }
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                disabled={loading}
              />
            </div>

            {viewMode === 'rag' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useRAG"
                  checked={useRAG}
                  onChange={(e) => setUseRAG(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="useRAG" className="text-sm text-gray-700 dark:text-gray-300">
                  Использовать RAG (поиск в документах)
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? (
                <span>⏳ Обработка...</span>
              ) : (
                <>
                  {viewMode === 'search' && '🔍 Найти'}
                  {viewMode === 'rag' && '🤖 Спросить у AI'}
                  {viewMode === 'compare' && '⚖️ Сравнить режимы'}
                </>
              )}
            </button>
          </form>

          {viewMode === 'compare' && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                💡 Режим сравнения запустит оба варианта (с RAG и без RAG) параллельно, 
                чтобы вы могли увидеть разницу в ответах.
              </p>
            </div>
          )}
        </div>

        {/* Ошибки */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-300 whitespace-pre-line">❌ {error}</p>
          </div>
        )}

        {/* RAG Ответ */}
        {ragAnswer && viewMode === 'rag' && (
          <div className="space-y-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {ragAnswer.mode === 'with_rag' ? '🤖 Ответ с RAG' : '💭 Ответ без RAG'}
                </h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  ragAnswer.mode === 'with_rag' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                }`}>
                  {ragAnswer.mode === 'with_rag' ? 'С документами' : 'Без документов'}
                </span>
              </div>

              <div className="prose dark:prose-invert max-w-none">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {ragAnswer.answer}
                </p>
              </div>

              {ragAnswer.mode === 'with_rag' && ragAnswer.rag_info && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    📚 Использованные источники
                  </h3>
                  
                  {ragAnswer.rag_info.context_quality && (
                    <div className={`mb-4 p-3 rounded-lg ${
                      ragAnswer.rag_info.context_quality.quality === 'high' 
                        ? 'bg-green-50 dark:bg-green-900/20'
                        : ragAnswer.rag_info.context_quality.quality === 'medium'
                        ? 'bg-yellow-50 dark:bg-yellow-900/20'
                        : 'bg-red-50 dark:bg-red-900/20'
                    }`}>
                      <p className="text-sm font-medium">
                        Качество контекста: {ragAnswer.rag_info.context_quality.quality}
                      </p>
                      <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                        {ragAnswer.rag_info.context_quality.recommendation}
                      </p>
                    </div>
                  )}

                  <div className="grid gap-3">
                    {ragAnswer.rag_info.sources?.sources?.map((source: any, idx: number) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-gray-900 dark:text-white">
                            📄 {source.filename}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {source.chunks_used} чанк(ов)
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          Релевантность: {(source.max_relevance * 100).toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>

                  {ragAnswer.rag_info.search_results && ragAnswer.rag_info.search_results.length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700">
                        Показать фрагменты текста
                      </summary>
                      <div className="mt-3 space-y-2">
                        {ragAnswer.rag_info.search_results.map((result: any, idx: number) => (
                          <div key={idx} className="p-3 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              {result.source} ({result.score}%)
                            </div>
                            <p className="text-gray-700 dark:text-gray-300">{result.text}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {ragAnswer.metadata && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>⏱️ {ragAnswer.metadata.duration_seconds}s</span>
                    <span>
                      📊 {ragAnswer.metadata.llm_usage?.input_tokens} вх + {ragAnswer.metadata.llm_usage?.output_tokens} вых токенов
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Результаты сравнения */}
        {compareResults && viewMode === 'compare' && (
          <div className="space-y-6 mb-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* С RAG */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    🤖 С RAG
                  </h2>
                  <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full text-xs font-medium">
                    С документами
                  </span>
                </div>

                {compareResults.results.with_rag?.success ? (
                  <>
                    <div className="prose dark:prose-invert max-w-none mb-4">
                      <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                        {compareResults.results.with_rag.answer}
                      </p>
                    </div>

                    {compareResults.results.with_rag.sources && (
                      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded text-xs">
                        <p className="font-medium mb-1">📚 Источников: {compareResults.results.with_rag.sources.total_sources}</p>
                        <p className="text-gray-600 dark:text-gray-400">
                          Качество: {compareResults.results.with_rag.context_quality?.quality}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-red-600 dark:text-red-400">❌ {compareResults.results.with_rag?.error}</p>
                )}
              </div>

              {/* Без RAG */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    💭 Без RAG
                  </h2>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-xs font-medium">
                    Только AI
                  </span>
                </div>

                {compareResults.results.without_rag?.success ? (
                  <>
                    <div className="prose dark:prose-invert max-w-none mb-4">
                      <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                        {compareResults.results.without_rag.answer}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-red-600 dark:text-red-400">❌ {compareResults.results.without_rag?.error}</p>
                )}
              </div>
            </div>

            {/* Анализ сравнения */}
            {compareResults.comparison?.analysis && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg shadow p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  📊 Анализ и рекомендации
                </h3>

                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  <div className="p-3 bg-white dark:bg-gray-800 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Длина ответа с RAG</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {compareResults.comparison.analysis.rag_answer_length} символов
                    </p>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Длина ответа без RAG</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {compareResults.comparison.analysis.no_rag_answer_length} символов
                    </p>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Использовано источников</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {compareResults.comparison.analysis.rag_used_sources}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                    💡 Рекомендация:
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {compareResults.comparison.analysis.recommendation}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Статистика поиска */}
        {searchStats && viewMode === 'search' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              📊 Найдено результатов: {searchStats.total_results} | 
              Средний score: {searchStats.avg_score} | 
              Время: {searchStats.duration_seconds}s
            </p>
          </div>
        )}

        {/* Результаты поиска */}
        {results.length > 0 && viewMode === 'search' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Результаты ({results.length})
            </h2>
            {results.map((result, index) => (
              <div
                key={result.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      #{index + 1}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      📄 {result.source}
                    </span>
                  </div>
                  <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-full text-sm font-medium">
                    {(result.score * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                  {result.text}
                </p>
                {result.metadata && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    Позиция в документе: {result.metadata.position} из {result.metadata.totalChunks}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Пустое состояние */}
        {!loading && results.length === 0 && !ragAnswer && !compareResults && query && !error && viewMode === 'search' && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              🤷 Ничего не найдено. Попробуйте другой запрос.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
