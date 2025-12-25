'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: any;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [useRAG, setUseRAG] = useState(true);
  const [useReranking, setUseReranking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          history: messages,
          useRAG,
          useReranking,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при отправке сообщения');
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        sources: data.sources,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `❌ Ошибка: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    if (confirm('Очистить историю чата?')) {
      setMessages([]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto p-4 max-w-5xl">
        {/* Заголовок */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <span>💬</span> RAG Чат с памятью
            </h1>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"
            >
              ← Назад
            </Link>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            Чат-бот с памятью диалога и поиском в документах через RAG
          </p>
        </div>

        {/* Настройки */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="chat-useRAG"
                checked={useRAG}
                onChange={(e) => setUseRAG(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded"
              />
              <label htmlFor="chat-useRAG" className="text-sm text-gray-700 dark:text-gray-300">
                📚 Поиск в документах (RAG)
              </label>
            </div>

            {useRAG && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chat-useReranking"
                  checked={useReranking}
                  onChange={(e) => setUseReranking(e.target.checked)}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded"
                />
                <label htmlFor="chat-useReranking" className="text-sm text-gray-700 dark:text-gray-300">
                  🎯 Реранкинг (+точность)
                </label>
              </div>
            )}

            <div className="ml-auto flex gap-2">
              <button
                onClick={clearChat}
                disabled={messages.length === 0}
                className="px-3 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🗑️ Очистить
              </button>
              <div className="text-sm text-gray-600 dark:text-gray-400 py-1">
                {messages.length} сообщений
              </div>
            </div>
          </div>
        </div>

        {/* Область сообщений */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-4 h-[600px] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                <div className="text-center">
                  <div className="text-6xl mb-4">💬</div>
                  <p className="text-lg">Начните диалог!</p>
                  <p className="text-sm mt-2">
                    {useRAG 
                      ? 'Задавайте вопросы по документам' 
                      : 'Общайтесь с AI ассистентом'}
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg">
                        {msg.role === 'user' ? '👤' : '🤖'}
                      </span>
                      <span className="text-xs opacity-70">
                        {new Date(msg.timestamp).toLocaleTimeString('ru-RU')}
                      </span>
                    </div>

                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Источники */}
                    {msg.sources && msg.sources.sources && msg.sources.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                        <div className="text-sm opacity-90 font-medium mb-2">
                          📚 Источники:
                        </div>
                        <div className="space-y-1">
                          {msg.sources.sources.map((src: any, sidx: number) => (
                            <div key={sidx} className="text-xs opacity-75">
                              • {src.filename} ({(src.max_relevance * 100).toFixed(0)}%)
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Думаю...
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Поле ввода */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Введите сообщение..."
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? '⏳' : '📤'}
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              💡 История диалога учитывается при ответе. Источники показываются под ответом.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
