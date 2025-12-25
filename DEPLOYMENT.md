# Руководство по развёртыванию

## Локальная разработка

### Быстрый старт

```bash
# 1. Установите зависимости
npm install

# 2. Создайте папку для документов
mkdir -p data/documents

# 3. Добавьте .md файлы в data/documents/

# 4. Запустите в режиме разработки
npm run dev

# 5. Откройте http://localhost:3000
# 6. Нажмите "Переиндексировать" в UI
```

---

## Production Build

### Локальный production

```bash
# Сборка
npm run build

# Запуск
npm start
```

### Переменные окружения

Создайте `.env.local` файл:

```env
NODE_ENV=production
```

---

## Docker

### Создание Dockerfile

```dockerfile
FROM node:20-alpine AS base

# Установка зависимостей
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Сборка приложения
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production образ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Создаём директорию для данных
RUN mkdir -p data/documents && chown -R nextjs:nodejs data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  semantic-search:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data/documents:/app/data/documents
      - index-data:/app/data
    environment:
      - NODE_ENV=production
    restart: unless-stopped

volumes:
  index-data:
```

### Сборка и запуск

```bash
# Сборка
docker-compose build

# Запуск
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

---

## Vercel

### Шаг 1: Подготовка

```bash
# Установите Vercel CLI
npm i -g vercel

# Залогиньтесь
vercel login
```

### Шаг 2: Конфигурация

Создайте `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

### Шаг 3: Деплой

```bash
# Preview деплой
vercel

# Production деплой
vercel --prod
```

### Примечание о данных на Vercel

⚠️ Vercel - serverless платформа. Файловая система эфемерна:
- Индекс нужно пересоздавать при каждом деплое
- Рассмотрите использование внешнего хранилища (S3, Vercel Blob)

---

## VPS / Собственный сервер

### Требования

- Node.js 18+
- 2GB RAM минимум (для Transformers.js)
- 5GB свободного места

### Шаг 1: Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2
sudo npm install -g pm2
```

### Шаг 2: Клонирование проекта

```bash
# Создайте директорию
mkdir -p /var/www
cd /var/www

# Клонируйте репозиторий (или загрузите файлы)
git clone <your-repo-url> semantic-search
cd semantic-search

# Установка зависимостей
npm ci --production
```

### Шаг 3: Сборка

```bash
npm run build
```

### Шаг 4: Настройка PM2

Создайте `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'semantic-search',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '2G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
```

### Шаг 5: Запуск

```bash
# Создайте папку для логов
mkdir logs

# Запуск с PM2
pm2 start ecosystem.config.js

# Сохранение конфигурации
pm2 save

# Автозапуск при перезагрузке
pm2 startup
```

### Шаг 6: Nginx (опционально)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# Создайте конфиг
sudo nano /etc/nginx/sites-available/semantic-search

# Активируйте
sudo ln -s /etc/nginx/sites-available/semantic-search /etc/nginx/sites-enabled/

# Проверьте конфигурацию
sudo nginx -t

# Перезапустите Nginx
sudo systemctl restart nginx
```

### Шаг 7: SSL (Let's Encrypt)

```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d your-domain.com

# Автообновление
sudo certbot renew --dry-run
```

---

## AWS / Cloud Providers

### AWS Elastic Beanstalk

1. Установите EB CLI
2. Инициализируйте: `eb init`
3. Создайте окружение: `eb create`
4. Деплой: `eb deploy`

### Google Cloud Run

```bash
# Сборка и пуш образа
gcloud builds submit --tag gcr.io/PROJECT-ID/semantic-search

# Деплой
gcloud run deploy semantic-search \
  --image gcr.io/PROJECT-ID/semantic-search \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### DigitalOcean App Platform

1. Подключите GitHub репозиторий
2. Выберите Node.js
3. Настройте переменные окружения
4. Деплой автоматический

---

## Мониторинг

### PM2 Monitoring

```bash
# Статус
pm2 status

# Логи
pm2 logs

# Мониторинг ресурсов
pm2 monit

# Web-интерфейс (опционально)
pm2 plus
```

### Health Check Endpoint

Добавьте в `app/api/health/route.ts`:

```typescript
export async function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
```

Настройте проверки:

```bash
# Добавьте в cron
*/5 * * * * curl -f http://localhost:3000/api/health || systemctl restart semantic-search
```

---

## Резервное копирование

### Автоматический бэкап индекса

```bash
#!/bin/bash
# backup-index.sh

BACKUP_DIR="/var/backups/semantic-search"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp /var/www/semantic-search/data/index.json $BACKUP_DIR/index_$TIMESTAMP.json

# Удаление старых бэкапов (старше 30 дней)
find $BACKUP_DIR -name "index_*.json" -mtime +30 -delete
```

Добавьте в cron:

```bash
# Ежедневный бэкап в 2 AM
0 2 * * * /path/to/backup-index.sh
```

---

## Масштабирование

### Горизонтальное масштабирование

⚠️ Индекс должен быть доступен всем инстансам:
- Используйте shared file system (NFS, S3)
- Или внешнюю базу данных (Redis, PostgreSQL)

### Кэширование

Добавьте Redis для кэширования результатов поиска:

```typescript
// lib/cache.ts
import { createClient } from 'redis';

const client = createClient();

export async function getCached(key: string) {
  return await client.get(key);
}

export async function setCache(key: string, value: string, ttl: number = 3600) {
  await client.setEx(key, ttl, value);
}
```

---

## Troubleshooting

### Проблема: Out of Memory

```bash
# Увеличьте Node.js heap
export NODE_OPTIONS="--max-old-space-size=4096"
```

### Проблема: Медленная индексация

- Используйте более мощное железо
- Уменьшите размер чанков
- Индексируйте порциями

### Проблема: Индекс не сохраняется

```bash
# Проверьте права доступа
sudo chown -R $USER:$USER /var/www/semantic-search/data
chmod -R 755 /var/www/semantic-search/data
```

---

## Безопасность

### Rate Limiting

Добавьте в `middleware.ts`:

```typescript
import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});

export async function middleware(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  return NextResponse.next();
}
```

### Аутентификация

Для приватных документов добавьте аутентификацию через NextAuth.js или аналог.

---

## Поддержка

При проблемах с развёртыванием:
1. Проверьте логи: `pm2 logs` или `docker-compose logs`
2. Убедитесь, что все зависимости установлены
3. Проверьте версию Node.js: `node -v` (должна быть 18+)
4. Проверьте наличие документов в `data/documents/`
