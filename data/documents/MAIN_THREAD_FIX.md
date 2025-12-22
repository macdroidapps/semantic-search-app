# Исправление ошибки "Not in applications main thread" ✅

**Дата:** 2025-12-19
**Статус:** Исправлено

---

## Проблема

При нажатии на кнопку затвора появлялся тоаст:
```
Not in applications main thread
```

### Причина

**Неправильный поток выполнения для CameraX операций:**

1. **CapturePhotoUseCase выполнялся в IO потоке:**
   ```kotlin
   // ❌ НЕПРАВИЛЬНО
   suspend operator fun invoke(config: PhotoCaptureConfig): Result<Uri> {
       return withContext(ioDispatcher) { // IO thread
           cameraRepository.capturePhoto(config.directoryPath)
       }
   }
   ```

2. **CameraX требует Main thread:**
   - Метод `takePicture()` должен вызываться на **главном потоке**
   - Это требование CameraX API
   - Выполнение в IO потоке вызывало ошибку

---

## Решение

### 1. Изменён поток выполнения на Main

#### `CapturePhotoUseCase.kt`

**Было:**
```kotlin
class CapturePhotoUseCase @Inject constructor(
    private val cameraRepository: CameraRepository,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher // ❌ IO dispatcher
) {
    suspend operator fun invoke(config: PhotoCaptureConfig): Result<Uri> {
        return withContext(ioDispatcher) { // ❌ IO thread
            try {
                cameraRepository.capturePhoto(config.directoryPath)
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
}
```

**Стало:**
```kotlin
class CapturePhotoUseCase @Inject constructor(
    private val cameraRepository: CameraRepository
    // ✅ Убрали IoDispatcher
) {
    suspend operator fun invoke(config: PhotoCaptureConfig): Result<Uri> {
        return withContext(Dispatchers.Main) { // ✅ Main thread
            try {
                cameraRepository.capturePhoto(config.directoryPath)
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
}
```

### 2. Добавлена проверка потока в CameraDataSource

#### `CameraDataSource.kt`

```kotlin
suspend fun capturePhoto(outputDirectory: String): Uri = suspendCoroutine { continuation ->
    val controller = cameraController
        ?: run {
            continuation.resumeWithException(
                IllegalStateException("Camera not initialized")
            )
            return@suspendCoroutine
        }

    // ✅ Проверка, что мы на Main thread
    if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) {
        continuation.resumeWithException(
            IllegalStateException("capturePhoto() must be called on Main thread")
        )
        return@suspendCoroutine
    }

    // ... остальной код
    controller.takePicture(
        outputOptions,
        ContextCompat.getMainExecutor(context), // ✅ Main executor для callback
        object : ImageCapture.OnImageSavedCallback {
            // ...
        }
    )
}
```

---

## Разделение потоков в модуле камеры

### Правильное распределение операций по потокам:

| Операция | Поток | Причина |
|----------|-------|---------|
| **Инициализация камеры** | Main | CameraX требует |
| **Съёмка фото** | Main | CameraX `takePicture()` требует |
| **Создание директорий/файлов** | Main | Быстрая операция, выполняется перед съёмкой |
| **Обработка изображения** (resize, compress) | IO | Тяжёлая CPU/IO операция |
| **AI-детекция** | Default | CPU-интенсивная операция |
| **Сохранение в Realm** | Main | Realm требует |
| **Чтение EXIF** | IO | Чтение файла |

### Поток выполнения съёмки (исправленный):

```
User нажимает кнопку затвора
    ↓
PhotoCaptureViewModel.takePhoto() [Main]
    ↓
CapturePhotoUseCase(config) [переключается на Main]
    ↓
CameraRepository.capturePhoto() [Main]
    ↓
CameraDataSource.capturePhoto() [Main]
    ├── Проверка Main thread ✅
    ├── Создание директории/файла [Main - быстро]
    ├── controller.takePicture() [Main - CameraX требует]
    └── callback onImageSaved [Main executor]
        ↓
        ProcessPhotoUseCase [переключается на IO для обработки]
            ├── Чтение EXIF [IO]
            ├── Resize изображения [IO]
            ├── Compress в WEBP [IO]
            └── Перезапись файла [IO]
                ↓
                DetectObjectsUseCase [Default - CPU операции]
                    ↓
                    SavePhotoUseCase [переключается на Main для Realm]
```

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `domain/usecase/camera/CapturePhotoUseCase.kt` | Убран `@IoDispatcher`, используется `Dispatchers.Main` |
| `data/source/camera/CameraDataSource.kt` | Добавлена проверка Main thread |

---

## Почему это правильно

### ✅ Соответствие требованиям CameraX

CameraX API **требует** выполнения операций захвата на Main thread:
- `takePicture()` должен вызываться на Main
- `bindToLifecycle()` должен вызываться на Main
- `enableTorch()` должен вызываться на Main

### ✅ Производительность

- Создание директории/файла - **быстрая операция** (несколько ms)
- Не блокирует UI thread
- Тяжёлая обработка (resize, compress) остаётся в IO потоке

### ✅ Чистая архитектура

- **UseCase** определяет поток выполнения
- **DataSource** проверяет соблюдение требований
- **Явное переключение потоков** через `withContext()`

---

## Тестирование

### Manual QA Checklist

- [x] Съёмка фото работает без ошибки "Not in applications main thread"
- [x] UI не блокируется при съёмке
- [x] Обработка фото выполняется асинхронно
- [x] Thumbnail обновляется корректно
- [x] Счётчик фото увеличивается

---

## Заключение

Проблема **полностью исправлена**! ✅

### Достижения:
- ✅ CameraX операции выполняются на Main thread (как требуется)
- ✅ Тяжёлая обработка остаётся в фоновых потоках
- ✅ Явное управление потоками через `withContext()`
- ✅ Добавлена проверка потока для раннего выявления ошибок
- ✅ Производительность не пострадала

**Съёмка фото теперь работает корректно!** 📸✨
