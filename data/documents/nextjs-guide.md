# Next.js: Современный React Framework

## Введение в Next.js

Next.js — это React-фреймворк для создания полнофункциональных веб-приложений. Он предоставляет строительные блоки для создания гибких, быстрых и SEO-оптимизированных приложений.

## Ключевые возможности

### Server-Side Rendering (SSR)
Next.js рендерит React компоненты на сервере, отправляя клиенту готовый HTML. Это улучшает производительность и SEO.

### Static Site Generation (SSG)
Генерация статических страниц на этапе сборки для максимальной производительности.

### App Router (новое в Next.js 13+)
Новая система маршрутизации на основе файловой системы с поддержкой:
- Server Components
- Streaming
- Suspense
- Nested Layouts

### API Routes
Создание API эндпоинтов прямо в Next.js приложении без отдельного сервера.

## Структура проекта

```
my-app/
├── app/
│   ├── page.tsx          # Главная страница (/)
│   ├── layout.tsx        # Корневой layout
│   ├── about/
│   │   └── page.tsx      # /about
│   └── api/
│       └── hello/
│           └── route.ts  # API endpoint
├── public/               # Статические файлы
├── package.json
└── next.config.js
```

## Маршрутизация

### Динамические маршруты
```typescript
// app/blog/[slug]/page.tsx
export default function Post({ params }: { params: { slug: string } }) {
  return <h1>Post: {params.slug}</h1>
}
```

### Группы маршрутов
```
app/
├── (marketing)/
│   ├── about/
│   └── contact/
└── (shop)/
    ├── products/
    └── cart/
```

## Data Fetching

### Server Components (по умолчанию)
```typescript
async function getData() {
  const res = await fetch('https://api.example.com/data')
  return res.json()
}

export default async function Page() {
  const data = await getData()
  return <main>{data.title}</main>
}
```

### Client Components
```typescript
'use client'

import { useState, useEffect } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

## Оптимизация

### Автоматическая оптимизация изображений
```typescript
import Image from 'next/image'

export default function Avatar() {
  return <Image src="/avatar.jpg" alt="Avatar" width={100} height={100} />
}
```

### Оптимизация шрифтов
```typescript
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })
```

### Автоматический Code Splitting
Next.js автоматически разделяет код для каждой страницы.

## Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server'

export function middleware(request: Request) {
  return NextResponse.redirect(new URL('/home', request.url))
}
```

## Метаданные и SEO

```typescript
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Page',
  description: 'Page description',
}
```

## Стилизация

### CSS Modules
```typescript
import styles from './page.module.css'

export default function Page() {
  return <div className={styles.container}>Content</div>
}
```

### Tailwind CSS
Next.js отлично интегрируется с Tailwind CSS из коробки.

### CSS-in-JS
Поддержка styled-components, Emotion и других библиотек.

## Деплой

### Vercel (рекомендуется)
Развёртывание в один клик с автоматическими превью для PR.

### Другие платформы
- AWS Amplify
- Docker
- Netlify
- Self-hosted

## Конфигурация

```javascript
// next.config.js
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['example.com'],
  },
  experimental: {
    serverActions: true,
  },
}
```

## Server Actions (экспериментально)

```typescript
async function createPost(formData: FormData) {
  'use server'
  
  const title = formData.get('title')
  // Сохранение в БД
}
```

## Тестирование

### Jest
```bash
npm install --save-dev jest @testing-library/react
```

### Playwright
```bash
npm install --save-dev @playwright/test
```

## Производительность

### Метрики Core Web Vitals
- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)

Next.js автоматически оптимизирует приложение для лучших показателей.

## Интеграции

### База данных
- Prisma
- MongoDB
- PostgreSQL
- Supabase

### Аутентификация
- NextAuth.js
- Clerk
- Auth0

### CMS
- Contentful
- Sanity
- Strapi

## Best Practices

1. **Используйте Server Components по умолчанию**
2. **Минимизируйте клиентский JavaScript**
3. **Кэшируйте данные где возможно**
4. **Используйте Incremental Static Regeneration (ISR)**
5. **Оптимизируйте изображения через next/image**
6. **Настройте мониторинг производительности**

## Миграция с Pages Router

Next.js поддерживает оба роутера одновременно, позволяя постепенную миграцию.

## Сообщество и ресурсы

- Официальная документация: nextjs.org
- GitHub: github.com/vercel/next.js
- Discord сервер
- Learn Next.js: интерактивный туториал

## Будущее Next.js

- Улучшения React Server Components
- Turbopack (замена Webpack)
- Расширенные возможности кэширования
- Новые паттерны data fetching

## Заключение

Next.js — мощный и гибкий фреймворк, который упрощает создание современных React-приложений. Он предоставляет отличный developer experience и производительность из коробки.
