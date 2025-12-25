@echo off
REM Скрипт для исправления проблемы с UI реранкинга (Windows)

echo Очистка кэша Next.js...

REM Удаляем скомпилированную версию
if exist .next rmdir /s /q .next

REM Удаляем кэш модулей
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo.
echo Кэш очищен!
echo.
echo Теперь запусти сервер:
echo npm run dev
echo.
echo И открой http://localhost:3000 с жёстким обновлением (Ctrl+Shift+R)
echo.
pause
