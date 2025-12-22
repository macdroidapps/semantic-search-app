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

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexInfo, setIndexInfo] = useState<IndexInfo | null>(null);
  const [error, setError] = useState('');
  const [searchStats, setSearchStats] = useState<any>(null);

  const fetchIndexInfo = async () => {
    try {
      const response = await fetch('/api/index');
      const data = await response.json();
      setIndexInfo(data);
    } catch (err) {
      console.error('Ошибка загрузки информации об индексе:', err);
    }
  };

  // Загрузка информации об индексе при монтировании
  useEffect(() => {
    fetchIndexInfo();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResults([]);
    setSearchStats(null);

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
      <div className="max-w-5xl mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            🔍 Семантический Поиск
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Поиск по markdown документам с использованием AI
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

        {/* Форма поиска */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Поисковый запрос
              </label>
              <input
                id="search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Введите вопрос или ключевые слова..."
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? '🔍 Поиск...' : '🔍 Найти'}
            </button>
          </form>
        </div>

        {/* Ошибки */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-300">❌ {error}</p>
          </div>
        )}

        {/* Статистика поиска */}
        {searchStats && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              📊 Найдено результатов: {searchStats.total_results} | 
              Средний score: {searchStats.avg_score} | 
              Время: {searchStats.duration_seconds}s
            </p>
          </div>
        )}

        {/* Результаты */}
        {results.length > 0 && (
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
        {!loading && results.length === 0 && query && !error && (
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
