# ⚡ Реранкинг - Быстрый старт

## 🎯 За 2 минуты

### Шаг 1: Базовый запрос (БЕЗ реранкинга)

```bash
curl -X POST http://localhost:3000/api/rag \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Кто разработчик Foodee?",
    "useRAG": true
  }'
```

**Результат:** Топ-5 по косинусному сходству

---

### Шаг 2: С реранкингом (включаем волшебство!)

```bash
curl -X POST http://localhost:3000/api/rag \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Кто разработчик Foodee?",
    "useRAG": true,
    "rerank": true
  }'
```

**Результат:** Топ-5 после умной переоценки!

---

### Шаг 3: Сравнение методов

```bash
curl -X POST http://localhost:3000/api/rag/rerank-compare \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Кто разработчик Foodee?"
  }'
```

**Результат:** Сравнение 4 методов side-by-side

---

## 📊 Что изменилось?

### БЕЗ реранкинга:

```json
{
  "answer": "...",
  "rag_info": {
    "sources": {
      "total_sources": 2,
      "sources": [
        {"filename": "foodee.md", "avg_relevance": 0.45}
      ]
    }
  }
}
```

### С реранкингом:

```json
{
  "answer": "...",
  "reranking_enabled": true,
  "rag_info": {
    "sources": {
      "total_sources": 2,
      "sources": [
        {"filename": "foodee.md", "avg_relevance": 0.67}
      ]
    },
    "reranking": {
      "avg_score_improvement": 0.22,
      "rerank_method": "hybrid",
      "quality_distribution": {
        "high": 4,
        "medium": 1,
        "low": 0
      }
    }
  }
}
```

**Результат:** +22% к average score! ✨

---

## 🎨 Методы реранкинга

### 1. hybrid (по умолчанию, рекомендуется)
```json
{"rerank": true}
```

### 2. keyword-boost (для технических запросов)
```json
{
  "rerank": true,
  "rerank_config": {"rerank_method": "keyword-boost"}
}
```

### 3. semantic-deep (для вопросов про людей/даты)
```json
{
  "rerank": true,
  "rerank_config": {"rerank_method": "semantic-deep"}
}
```

---

## ⚙️ Настройки

```json
{
  "query": "Ваш вопрос",
  "useRAG": true,
  "rerank": true,
  "rerank_config": {
    "rerank_method": "hybrid",
    "min_rerank_score": 0.5,
    "top_k_for_rerank": 20,
    "final_top_k": 5
  }
}
```

---

## 📈 Когда помогает?

✅ Технические термины  
✅ Вопросы про людей/даты  
✅ Сложные запросы  
✅ Когда базовый поиск даёт "около того"  

❌ Очень простые запросы  
❌ Когда нужна максимальная скорость  

---

## 💡 Рекомендации

1. **Используй `hybrid`** - работает везде
2. **Установи `min_rerank_score: 0.5`** - баланс recall/precision  
3. **Начни с `top_k_for_rerank: 20`** - оптимально

---

**Подробнее:** См. `RERANKING_GUIDE.md` 📚
