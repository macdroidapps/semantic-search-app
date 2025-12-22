# API Examples - Примеры использования

## Индексация документов

### Запустить индексацию
```bash
curl -X POST http://localhost:3000/api/index
```

### Получить информацию об индексе
```bash
curl http://localhost:3000/api/index
```

Пример ответа:
```json
{
  "exists": true,
  "metadata": {
    "model": "Xenova/all-MiniLM-L6-v2",
    "indexed_at": "2024-12-22T10:30:00.000Z",
    "total_chunks": 150,
    "total_documents": 3,
    "documents": [
      "semantic-search.md",
      "machine-learning.md",
      "nextjs-guide.md"
    ]
  }
}
```

---

## Поиск

### Базовый поиск
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "семантический поиск"
  }'
```

### Поиск с параметрами
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "машинное обучение",
    "top_k": 10,
    "min_score": 0.4
  }'
```

### Поиск с высокой точностью
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Next.js Server Components",
    "top_k": 3,
    "min_score": 0.6
  }'
```

### Широкий поиск (больше результатов)
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "искусственный интеллект",
    "top_k": 20,
    "min_score": 0.2
  }'
```

Пример ответа:
```json
{
  "success": true,
  "query": "машинное обучение",
  "results": [
    {
      "id": "abc-123",
      "text": "Машинное обучение (Machine Learning, ML) — это раздел искусственного интеллекта...",
      "source": "machine-learning.md",
      "score": 0.8523,
      "metadata": {
        "position": 1,
        "totalChunks": 20
      }
    },
    {
      "id": "def-456",
      "text": "Supervised Learning - модель обучается на размеченных данных...",
      "source": "machine-learning.md",
      "score": 0.7234,
      "metadata": {
        "position": 3,
        "totalChunks": 20
      }
    }
  ],
  "stats": {
    "total_results": 10,
    "avg_score": 0.6234,
    "max_score": 0.8523,
    "min_score": 0.4012,
    "duration_seconds": 0.234
  },
  "index_info": {
    "total_chunks": 150,
    "model": "Xenova/all-MiniLM-L6-v2"
  }
}
```

### Получить справку по API
```bash
curl http://localhost:3000/api/search
```

---

## Примеры поисковых запросов

### Технические термины
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "векторные эмбеддинги"}'
```

### Вопросы
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "как работает обучение с учителем?"}'
```

### Концепции
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "server-side rendering в React"}'
```

### Сравнения
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "разница между SSR и SSG"}'
```

---

## Использование в коде

### JavaScript/TypeScript
```typescript
async function search(query: string) {
  const response = await fetch('http://localhost:3000/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: 5, min_score: 0.3 }),
  });
  
  const data = await response.json();
  return data.results;
}

// Использование
const results = await search('машинное обучение');
console.log(results);
```

### Python
```python
import requests

def search(query: str, top_k: int = 5, min_score: float = 0.3):
    response = requests.post(
        'http://localhost:3000/api/search',
        json={'query': query, 'top_k': top_k, 'min_score': min_score}
    )
    return response.json()['results']

# Использование
results = search('семантический поиск')
for result in results:
    print(f"{result['score']:.2f} - {result['text'][:100]}...")
```

### PHP
```php
<?php
function search($query, $topK = 5, $minScore = 0.3) {
    $data = [
        'query' => $query,
        'top_k' => $topK,
        'min_score' => $minScore
    ];
    
    $options = [
        'http' => [
            'header'  => "Content-type: application/json\r\n",
            'method'  => 'POST',
            'content' => json_encode($data)
        ]
    ];
    
    $context = stream_context_create($options);
    $result = file_get_contents('http://localhost:3000/api/search', false, $context);
    
    return json_decode($result, true)['results'];
}

// Использование
$results = search('Next.js');
foreach ($results as $result) {
    echo $result['score'] . ' - ' . substr($result['text'], 0, 100) . "...\n";
}
?>
```

---

## Тестирование производительности

### Простой бенчмарк
```bash
# 10 последовательных запросов
for i in {1..10}; do
  time curl -X POST http://localhost:3000/api/search \
    -H "Content-Type: application/json" \
    -d '{"query": "машинное обучение"}' \
    -s > /dev/null
done
```

### Параллельные запросы (требует GNU parallel)
```bash
# 5 параллельных запросов
seq 5 | parallel -j5 'curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"test query {}\"}" \
  -s > /dev/null'
```

---

## Обработка ошибок

### Пустой запрос
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": ""}'
```
Ответ:
```json
{
  "error": "Параметр \"query\" обязателен и должен быть непустой строкой"
}
```

### Несуществующий индекс
```bash
# Удалите data/index.json и попробуйте поиск
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}'
```
Ответ:
```json
{
  "error": "Индекс не найден. Сначала выполните индексацию документов через POST /api/index"
}
```

---

## Полезные команды

### Красивый вывод JSON (требует jq)
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "машинное обучение"}' | jq
```

### Сохранить результаты в файл
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "машинное обучение"}' \
  -o results.json
```

### Показать только топ результат
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "машинное обучение"}' | jq '.results[0]'
```
