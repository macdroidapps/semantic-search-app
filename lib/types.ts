/**
 * Структура индексированного чанка
 */
export interface IndexedChunk {
  id: string;
  text: string;
  source: string;
  embedding: number[];
  metadata?: {
    position: number;
    totalChunks: number;
  };
}

/**
 * Метаданные индекса
 */
export interface IndexMetadata {
  model: string;
  indexed_at: string;
  total_chunks: number;
  total_documents: number;
  documents: string[];
}

/**
 * Полная структура индекса
 */
export interface SearchIndex {
  chunks: IndexedChunk[];
  metadata: IndexMetadata;
}
