#!/bin/bash

# Скрипт для сборки и упаковки проекта Semantic Search App
# Использование: bash build-package.sh

set -e  # Остановка при ошибке

echo "🚀 Начало сборки проекта Semantic Search App..."
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Переменные
PROJECT_NAME="semantic-search-app"
OUTPUT_DIR="dist"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Создание временной директории
echo -e "${BLUE}📁 Создание структуры проекта...${NC}"
rm -rf $OUTPUT_DIR
mkdir -p $OUTPUT_DIR/$PROJECT_NAME

# Копирование файлов проекта
echo -e "${BLUE}📋 Копирование файлов...${NC}"

# Корневые файлы
cp package.json $OUTPUT_DIR/$PROJECT_NAME/
cp tsconfig.json $OUTPUT_DIR/$PROJECT_NAME/
cp next.config.js $OUTPUT_DIR/$PROJECT_NAME/
cp tailwind.config.js $OUTPUT_DIR/$PROJECT_NAME/
cp postcss.config.js $OUTPUT_DIR/$PROJECT_NAME/
cp .gitignore $OUTPUT_DIR/$PROJECT_NAME/
cp .env.example $OUTPUT_DIR/$PROJECT_NAME/

# Документация
cp README.md $OUTPUT_DIR/$PROJECT_NAME/
cp QUICKSTART.md $OUTPUT_DIR/$PROJECT_NAME/
cp API_EXAMPLES.md $OUTPUT_DIR/$PROJECT_NAME/
cp DEPLOYMENT.md $OUTPUT_DIR/$PROJECT_NAME/
cp PROJECT_SUMMARY.md $OUTPUT_DIR/$PROJECT_NAME/

# Директории с кодом
cp -r app $OUTPUT_DIR/$PROJECT_NAME/
cp -r lib $OUTPUT_DIR/$PROJECT_NAME/
cp -r data $OUTPUT_DIR/$PROJECT_NAME/

echo -e "${GREEN}✅ Файлы скопированы${NC}"

# Создание архивов
echo ""
echo -e "${BLUE}📦 Создание архивов...${NC}"

cd $OUTPUT_DIR

# ZIP архив
echo "  - Создание ZIP..."
zip -r ${PROJECT_NAME}.zip $PROJECT_NAME/ -q
echo -e "${GREEN}  ✅ ${PROJECT_NAME}.zip создан${NC}"

# TAR.GZ архив
echo "  - Создание TAR.GZ..."
tar -czf ${PROJECT_NAME}.tar.gz $PROJECT_NAME/
echo -e "${GREEN}  ✅ ${PROJECT_NAME}.tar.gz создан${NC}"

# Архив с датой
echo "  - Создание версионного архива..."
zip -r ${PROJECT_NAME}_${TIMESTAMP}.zip $PROJECT_NAME/ -q
echo -e "${GREEN}  ✅ ${PROJECT_NAME}_${TIMESTAMP}.zip создан${NC}"

cd ..

# Статистика
echo ""
echo -e "${BLUE}📊 Статистика проекта:${NC}"
echo "  Файлов TypeScript: $(find $OUTPUT_DIR/$PROJECT_NAME -name "*.ts" -o -name "*.tsx" | wc -l)"
echo "  Файлов JavaScript: $(find $OUTPUT_DIR/$PROJECT_NAME -name "*.js" | wc -l)"
echo "  Файлов CSS: $(find $OUTPUT_DIR/$PROJECT_NAME -name "*.css" | wc -l)"
echo "  Markdown файлов: $(find $OUTPUT_DIR/$PROJECT_NAME -name "*.md" | wc -l)"
echo "  Всего файлов: $(find $OUTPUT_DIR/$PROJECT_NAME -type f | wc -l)"

# Размеры архивов
echo ""
echo -e "${BLUE}📦 Размеры архивов:${NC}"
ls -lh $OUTPUT_DIR/*.{zip,tar.gz} 2>/dev/null | awk '{print "  " $9 ": " $5}'

# Создание README для архивов
cat > $OUTPUT_DIR/README.txt << 'EOF'
╔═══════════════════════════════════════════════════════════╗
║          SEMANTIC SEARCH APP - INSTALLATION               ║
╚═══════════════════════════════════════════════════════════╝

📦 Содержимое:
- semantic-search-app/          - Проект
- semantic-search-app.zip        - ZIP архив
- semantic-search-app.tar.gz     - TAR.GZ архив

🚀 БЫСТРЫЙ СТАРТ:

1. Распакуйте архив:
   
   Windows:
   - Правый клик → Извлечь все
   
   Linux/Mac:
   unzip semantic-search-app.zip
   # или
   tar -xzf semantic-search-app.tar.gz

2. Установите зависимости:
   
   cd semantic-search-app
   npm install

3. Запустите:
   
   npm run dev

4. Откройте в браузере:
   
   http://localhost:3000

5. Нажмите "Переиндексировать" в UI

6. Начинайте поиск!

📚 Документация:
- QUICKSTART.md      - Быстрый старт (5 минут)
- README.md          - Полная документация
- API_EXAMPLES.md    - Примеры использования API
- DEPLOYMENT.md      - Production развёртывание

💡 Поддержка:
- Проблемы с установкой? Смотрите README.md
- Вопросы по API? Читайте API_EXAMPLES.md
- Деплой в production? Следуйте DEPLOYMENT.md

✨ Готово! Наслаждайтесь семантическим поиском!

EOF

echo ""
echo -e "${GREEN}✨ Сборка завершена успешно!${NC}"
echo ""
echo -e "${YELLOW}📂 Результаты находятся в директории: $OUTPUT_DIR/${NC}"
echo ""
echo "Доступные архивы:"
echo "  - ${PROJECT_NAME}.zip"
echo "  - ${PROJECT_NAME}.tar.gz"
echo "  - ${PROJECT_NAME}_${TIMESTAMP}.zip (версионный)"
echo ""
echo -e "${BLUE}💡 Для развёртывания распакуйте любой архив и следуйте QUICKSTART.md${NC}"
echo ""
