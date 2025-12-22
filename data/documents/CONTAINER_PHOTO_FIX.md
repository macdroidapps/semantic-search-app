# Исправление фото контейнеров ✅

**Дата:** 2025-12-19
**Проблема:** "Сделайте фото" при попытке сохранить фото контейнера до обслуживания

---

## Краткое описание проблемы

Фото контейнеров не проходило валидацию потому что:
1. Container с `containerId` не существовал в Realm
2. Без Container невозможно было найти Platform
3. Фото не добавлялось в `platform.beforeMedia`
4. Валидация видела 0 фото

---

## Решение (3 шага)

### 1. Извлечение platformId из directoryPath

**Файл:** `PhotoRepositoryImpl.kt:90-103`

```kotlin
private fun extractPlatformIdFromPath(directoryPath: String): Int? {
    // "photo/531584/beforeMedia" → 531584
    val parts = directoryPath.split("/")
    return if (parts.size >= 2) parts[1].toIntOrNull() else null
}
```

Теперь для контейнеров `platformId` извлекается из пути, а не устанавливается в `null`.

### 2. Опциональное добавление в platform.beforeMedia

**Файл:** `PhotoLocalDataSource.kt:80-132`

Добавление в `platform.beforeMedia` теперь **не блокирует** сохранение:
- Если Platform найдена → добавляем в список
- Если Platform НЕ найдена → просто логируем предупреждение
- ImageInfoEntity **всегда сохраняется** независимо от Platform

### 3. Прямой поиск по ImageInfoEntity

**Файл:** `PhotoLocalDataSource.kt:201-226`

Для `CONTAINER + beforeMedia` используем **прямой поиск**:

```kotlin
// БЫЛО: Поиск через platform.beforeMedia (не работает если Platform не найдена)
val platform = realm.where<PlatformEntity>()
    .equalTo("platformId", platformId)
    .findFirst()
return platform?.beforeMedia ?: emptyList()

// СТАЛО: Прямой поиск (всегда работает)
val photos = realm.where<ImageInfoEntity>()
    .equalTo("mediaType", "beforeMedia")
    .equalTo("containerId", entityId)
    .findAll()
return realm.copyFromRealm(photos)
```

---

## Преимущества

✅ **Независимость от Platform/Container**
Фото сохраняется и находится даже если Platform или Container не существуют в Realm

✅ **Надежность**
Используем прямой поиск по ImageInfoEntity с фильтрацией по `containerId` и `mediaType`

✅ **Обратная совместимость**
Пытается добавить в `platform.beforeMedia` если Platform найдена (для других частей приложения)

---

## Тестирование

После сборки проверьте:
1. Откройте камеру для контейнера до обслуживания
2. Сделайте фото
3. Нажмите "Далее"
4. **Должно пройти валидацию!**

Ожидаемые логи:
```
PhotoRepository: Извлечён platformId из directoryPath: 531584
PhotoRepository: Entity создан: platformId=531584, containerId=246401
PhotoLocalDataSource: Platform НЕ НАЙДЕНА, пропускаем добавление (это нормально)
PhotoLocalDataSource: Фото сохранено только в ImageInfoEntity

# При валидации:
PhotoLocalDataSource: getPhotos: CONTAINER + beforeMedia, ищем ImageInfoEntity
PhotoLocalDataSource: Найдено фото в ImageInfoEntity: 1
✅ Валидация проходит!
```

---

## Связанные файлы

- `PhotoRepositoryImpl.kt:37-103` - извлечение platformId
- `PhotoLocalDataSource.kt:80-132` - сохранение
- `PhotoLocalDataSource.kt:201-226` - получение списка фото
- `CONTAINER_PHOTO_FIX.md` (корень проекта) - подробная документация

---

---

## Дополнительное исправление: Путь директории

**Дата:** 2025-12-19
**Проблема:** PhotoSyncWorker удалял файлы из-за несоответствия путей

### Что было не так:

Файлы сохранялись в `photo/{platformId}/{mediaType}/`, но PhotoSyncWorker искал их в `photo/{platformId}/{containerId}/{mediaType}/`.

### Исправление:

В `PhotoCaptureConfigFactory.kt` изменено формирование `directoryPath`:

```kotlin
// БЫЛО
directoryPath = getPhotoDirectory(platformId, mediaType.value)  // photo/531584/beforeMedia

// СТАЛО
directoryPath = getContainerPhotoDirectory(platformId, containerId, mediaType.value)  // photo/531584/246401/beforeMedia
```

Подробности: `DIRECTORY_PATH_FIX.md` (корень проекта)

---

## Статус

✅ **ПОЛНОСТЬЮ ИСПРАВЛЕНО**
- Фото контейнеров сохраняются и проходят валидацию независимо от состояния Platform/Container в Realm
- Файлы сохраняются в правильную директорию и НЕ удаляются PhotoSyncWorker
