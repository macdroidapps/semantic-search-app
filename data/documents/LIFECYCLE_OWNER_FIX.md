# Исправление ошибки "LifecycleOwner not set" ✅

**Дата:** 2025-12-19
**Статус:** Исправлено

---

## Проблема

При запуске камеры возникала ошибка:
```
LifecycleOwner not set
```

### Причина

Архитектурная проблема в управлении `LifecycleOwner`:

1. **Два разных экземпляра Repository:**
   - `PhotoCaptureFragment` инжектировал `CameraRepositoryImpl` (конкретную реализацию)
   - `PhotoCaptureViewModel` инжектировал `CameraRepository` (интерфейс)
   - Hilt создавал два разных экземпляра, несмотря на `@Singleton`

2. **Метод отсутствовал в интерфейсе:**
   - `setLifecycleOwner()` был только в `CameraRepositoryImpl`
   - Не был объявлен в интерфейсе `CameraRepository`
   - Fragment устанавливал `lifecycleOwner` в один экземпляр
   - ViewModel использовал другой экземпляр, где `lifecycleOwner = null`

3. **Неправильное хранение состояния UI:**
   - `LifecycleOwner` хранился в Repository (Data слой)
   - Это нарушает принципы Clean Architecture
   - Repository не должен хранить UI-состояние

---

## Решение

### 1. Передача LifecycleOwner через параметры

Вместо хранения `lifecycleOwner` в Repository, теперь он передаётся напрямую в методы:

#### `CameraRepository.kt` (интерфейс)
```kotlin
suspend fun initializeCamera(
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    cameraMode: CameraMode
): Result<PreviewConfig>
```

#### `InitializeCameraUseCase.kt`
```kotlin
suspend operator fun invoke(
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    cameraMode: CameraMode
): Result<PreviewConfig>
```

#### `PhotoCaptureViewModel.kt`
```kotlin
// Хранит LifecycleOwner, полученный из Fragment
private var lifecycleOwner: androidx.lifecycle.LifecycleOwner? = null

fun init(config: PhotoCaptureConfig, lifecycleOwner: androidx.lifecycle.LifecycleOwner) {
    this.lifecycleOwner = lifecycleOwner
    // ...
}

private fun initialize() {
    val owner = lifecycleOwner ?: return
    val result = initializeCameraUseCase(owner, config.cameraMode)
    // ...
}
```

#### `PhotoCaptureFragment.kt`
```kotlin
override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
    super.onViewCreated(view, savedInstanceState)
    
    // Передаём viewLifecycleOwner в ViewModel при инициализации
    viewModel.init(config, viewLifecycleOwner)
    
    // Проверка разрешений и инициализация камеры
    checkCameraPermission()
}
```

### 2. Удалено из CameraRepositoryImpl

```kotlin
// ❌ УДАЛЕНО
private var lifecycleOwner: LifecycleOwner? = null

fun setLifecycleOwner(owner: LifecycleOwner) {
    this.lifecycleOwner = owner
}
```

### 3. Упрощён метод переключения режима камеры

```kotlin
// ❌ Старый API (удалён из интерфейса)
suspend fun setCameraMode(mode: CameraMode): Result<PreviewConfig>

// ✅ Новый подход (переинициализация камеры)
private fun setCameraMode(mode: CameraMode) {
    val owner = lifecycleOwner ?: return
    val result = initializeCameraUseCase(owner, mode)
    // ...
}
```

---

## Архитектурные улучшения

### ✅ Правильное разделение ответственности

| Слой | Ответственность | LifecycleOwner |
|------|----------------|----------------|
| **Presentation (Fragment)** | Владеет `viewLifecycleOwner` | Передаёт в ViewModel |
| **Presentation (ViewModel)** | Хранит `lifecycleOwner` временно | Передаёт в UseCase |
| **Domain (UseCase)** | Бизнес-логика | Передаёт в Repository |
| **Data (Repository)** | Работа с CameraX | НЕ хранит, только использует |

### ✅ Единый экземпляр Repository

Теперь `Fragment` и `ViewModel` используют один и тот же `@Singleton` экземпляр `CameraRepository`.

### ✅ Явная передача зависимостей

`LifecycleOwner` передаётся явно через параметры методов, а не скрывается внутри Repository.

---

## Порядок вызовов (исправленный)

```
1. Fragment.onCreate()
   └── [config загружена]

2. Fragment.onViewCreated()
   ├── viewModel.init(config, viewLifecycleOwner)  // LifecycleOwner установлен ✅
   └── checkCameraPermission()
       └── view?.post { 
           └── viewModel.handleEvent(Initialize)
               └── initialize()
                   └── initializeCameraUseCase(lifecycleOwner, cameraMode)
                       └── cameraRepository.initializeCamera(lifecycleOwner, cameraMode)
                           └── cameraDataSource.initializeCamera(lifecycleOwner, cameraMode)
                               └── CameraX.bindToLifecycle(lifecycleOwner, ...) ✅
```

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `domain/repository/CameraRepository.kt` | Добавлен параметр `lifecycleOwner` в `initializeCamera()` |
| `data/repository/CameraRepositoryImpl.kt` | Удалён `setLifecycleOwner()`, обновлён `initializeCamera()` |
| `domain/usecase/camera/InitializeCameraUseCase.kt` | Добавлен параметр `lifecycleOwner` в `invoke()` |
| `presentation/ui/capture/PhotoCaptureViewModel.kt` | Добавлено поле `lifecycleOwner`, обновлён `init()` и `initialize()` |
| `presentation/ui/capture/PhotoCaptureFragment.kt` | Передача `viewLifecycleOwner` в `viewModel.init()` |

---

## Тестирование

### Manual QA Checklist

- [x] Камера запускается без ошибки "LifecycleOwner not set"
- [x] Переключение режима камеры (4:3 / 16:9) работает
- [x] Вспышка включается/выключается
- [x] Съёмка фото работает
- [x] Галерея открывается
- [x] Поворот экрана не вызывает краш

### Unit Tests

Существующие тесты не затронуты, так как они не используют `CameraRepository` напрямую:
- ✅ `GetPhotoCountUseCaseTest` (3 теста)
- ✅ `PhotoCaptureConfigFactoryTest` (7 тестов)
- ✅ `ValidateBeforeNavigationUseCaseTest` (6 тестов)

---

## Заключение

Проблема **полностью исправлена** с улучшением архитектуры! ✅

### Достижения:
- ✅ Ошибка "LifecycleOwner not set" устранена
- ✅ Правильная передача зависимостей (явная, а не скрытая)
- ✅ Repository не хранит UI-состояние
- ✅ Единый экземпляр Repository для всех компонентов
- ✅ Clean Architecture принципы соблюдены

**Камера теперь работает корректно!** 🎥📸
