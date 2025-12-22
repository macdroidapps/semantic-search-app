Ты — эксперт Android-архитектор, специализирующийся на рефакторинге legacy-кода с применением современных best practices. Твоя задача — провести полный рефакторинг модуля съёмки фото согласно анализу в `.claude.md`.

## КОНТЕКСТ ПРОЕКТА

### Исходные данные
- **Документация:** Полный анализ текущей архитектуры находится в файле `.claude.md` — это твоя основная reference-база
- **Текущее состояние:** Legacy-код в классе `APhotoF` и его наследниках работает в продакшене, но требует полной переработки
- **Базовая структура:** Я уже подготовил каталоги для новой архитектуры

### Критические ограничения проекта
**REALM DATABASE:**
- ⚠️ **Работа с Realm выполняется ТОЛЬКО в главном потоке** — это архитектурное ограничение проекта
- Нельзя изменить этот подход, нужно с ним работать
- **Стратегия mitigation:**
    - Все тяжёлые вычисления и обработка данных — в фоновых потоках
    - В главный поток передавать только готовые, обработанные результаты
    - Минимизировать объём данных, записываемых в Realm за одну транзакцию
    - Использовать suspending функции с `withContext(Dispatchers.Main)` только для операций с Realm
    - Подготовка данных для записи в Realm — в фоне, сама запись — быстро в главном потоке

## АРХИТЕКТУРНЫЕ ТРЕБОВАНИЯ

### Обязательные паттерны
**1. Clean Architecture — строгое разделение слоёв:**
```
presentation/
├── ui/
│   ├── PhotoCaptureFragment.kt
│   ├── PhotoCaptureViewModel.kt
│   └── PhotoCaptureContract.kt (State/Event/Effect)
├── mapper/
│   └── PhotoUiMapper.kt
│
domain/
├── model/
│   └── PhotoCapture.kt (domain модели)
├── usecase/
│   ├── InitializeCameraUseCase.kt
│   ├── CapturePhotoUseCase.kt
│   ├── SavePhotoUseCase.kt
│   ├── ProcessPhotoUseCase.kt
│   └── RequestCameraPermissionUseCase.kt
├── repository/
│   └── PhotoRepository.kt (интерфейс)
│
data/
├── repository/
│   └── PhotoRepositoryImpl.kt
├── source/
│   ├── local/
│   │   └── PhotoLocalDataSource.kt (работа с Realm)
│   └── camera/
│       └── CameraDataSource.kt (Camera API обёртка)
├── mapper/
│   └── PhotoDataMapper.kt
└── model/
    └── PhotoEntity.kt (data модели)
```

**2. MVI Pattern — однонаправленный поток данных:**
```kotlin
// Контракт в presentation слое
sealed interface PhotoCaptureState {
    object Initial : PhotoCaptureState
    object Loading : PhotoCaptureState
    data class CameraReady(val previewConfig: PreviewConfig) : PhotoCaptureState
    data class PhotoCaptured(val photoUri: Uri) : PhotoCaptureState
    data class Error(val message: String) : PhotoCaptureState
}

sealed interface PhotoCaptureEvent {
    object InitializeCamera : PhotoCaptureEvent
    object CapturePhoto : PhotoCaptureEvent
    data class SavePhoto(val uri: Uri) : PhotoCaptureEvent
    object RetryLastAction : PhotoCaptureEvent
}

sealed interface PhotoCaptureEffect {
    data class ShowToast(val message: String) : PhotoCaptureEffect
    data class NavigateToPreview(val photoUri: Uri) : PhotoCaptureEffect
    object RequestPermissions : PhotoCaptureEffect
}
```

**3. UI Layer — Fragment + XML:**
- Использовать классические Fragment с View Binding
- Layout в XML (не Compose)
- ViewModel для управления состоянием
- LiveData или StateFlow для наблюдения за состоянием

## ТРЕБОВАНИЯ К РЕАЛИЗАЦИИ

### Производительность и потоки
**Фоновая обработка (обязательно):**
- Все операции с Camera API → `Dispatchers.IO`
- Обработка изображений (bitmap operations, compression) → `Dispatchers.Default`
- Файловые операции (save/load) → `Dispatchers.IO`
- Тяжёлые вычисления → Coroutines с соответствующим dispatcher

**Главный поток (только для):**
- UI updates
- **Операции с Realm** (запись/чтение)
- View lifecycle callbacks

**Паттерн работы с Realm:**
```kotlin
// ✅ ПРАВИЛЬНО
suspend fun savePhotoToDatabase(photoData: ProcessedPhotoData) {
    // Тяжёлая обработка в фоне
    val preparedData = withContext(Dispatchers.Default) {
        // Подготовка данных, сжатие, трансформации
        prepareForDatabase(photoData)
    }
    
    // Быстрая запись в главном потоке
    withContext(Dispatchers.Main) {
        realm.executeTransaction { realm ->
            realm.copyToRealm(preparedData.toRealmObject())
        }
    }
}

// ❌ НЕПРАВИЛЬНО
suspend fun savePhotoToDatabase(photoData: PhotoData) {
    withContext(Dispatchers.Main) {
        realm.executeTransaction { realm ->
            // Долгая обработка в главном потоке — плохо!
            val processed = heavyProcessing(photoData)
            realm.copyToRealm(processed)
        }
    }
}
```

### UseCase Guidelines
Каждый UseCase должен:
- Иметь одну чёткую ответственность (Single Responsibility)
- Быть suspend функцией или возвращать Flow
- Работать с domain-моделями (не Entity, не UI-модели)
- Обрабатывать ошибки и оборачивать результат в `Result<T>` или sealed class
- Выполняться в подходящем Dispatcher (настраивается через DI)
```kotlin
class CapturePhotoUseCase @Inject constructor(
    private val photoRepository: PhotoRepository,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) {
    suspend operator fun invoke(config: CaptureConfig): Result<PhotoCapture> {
        return withContext(ioDispatcher) {
            try {
                val photo = photoRepository.capturePhoto(config)
                Result.success(photo)
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
}
```

### Обработка ошибок
- Логировать все исключения
- Graceful degradation — приложение не должно крашиться
- Информативные сообщения пользователю
- Retry-механизмы для сетевых и IO операций
- Сохранение последнего успешного состояния

### Memory Management
- Правильная очистка Camera resources в onPause/onDestroy
- Отмена корутин при уничтожении ViewModel
- Избегать утечек Context через lambdas
- Освобождение bitmap после использования

## ПОШАГОВЫЙ ПЛАН РЕФАКТОРИНГА

### Этап 1: Подготовка инфраструктуры
1. **Создай Domain Layer:**
    - Domain модели (data class без Android/Realm зависимостей)
    - Repository интерфейс
    - UseCase классы (пока с TODO заглушками)

2. **Создай Data Layer:**
    - Data модели (Entity для Realm, DTO если нужны)
    - Mappers (Entity ↔ Domain)
    - Repository реализация
    - DataSource интерфейсы и реализации

3. **Создай Presentation Layer:**
    - Contract (State/Event/Effect)
    - ViewModel с MVI логикой
    - UI Mapper (Domain → UI модели)
    - Fragment skeleton с View Binding

### Этап 2: Миграция логики по модулям
**Используй `.claude.md` как карту:**
- Для каждого костыля из документации найди правильное решение
- Перенеси бизнес-логику в соответствующий UseCase
- Сохрани все edge cases и граничные условия
- Проверяй соответствие по таблице "старое → новое"

**Приоритет миграции:**
1. Camera initialization и permissions
2. Photo capture механизм
3. Photo processing и saving
4. Error handling и edge cases
5. UI state management

### Этап 3: Camera API обёртка
- Создай абстракцию над Camera API (CameraX или Camera2)
- Инкапсулируй всю платформенно-специфичную логику
- Обеспечь lifecycle-aware поведение
- Добавь callback → Flow/Channel адаптеры

### Этап 4: Интеграция с UI
- Подключи ViewModel к Fragment
- Настрой View Binding
- Реализуй наблюдение за State/Effect
- Добавь обработку Event от пользователя
- Настрой Navigation если нужно

### Этап 5: Тестирование и оптимизация
- Unit тесты для UseCases
- Unit тесты для ViewModel (MVI логика)
- Проверка на утечки памяти (LeakCanary)
- Profiling производительности (Android Profiler)
- Сравнение поведения с legacy версией

## ИНСТРУКЦИИ ПО ВЫПОЛНЕНИЮ

### Формат работы
**Работай итеративно:**
- Создавай по одному компоненту за раз
- После каждого компонента спрашивай подтверждение перед продолжением
- Показывай полный код файла, не используй "..." для пропуска
- Объясняй архитектурные решения для сложных мест

**Приоритизируй читаемость:**
- Подробные комментарии для сложной логики
- KDoc для public API
- Понятные имена переменных и функций
- Группируй related код вместе

**Следуй Kotlin best practices:**
- Используй data classes, sealed classes/interfaces
- Coroutines вместо callbacks
- Extension functions где уместно
- Nullable типы с safe calls
- Scope functions (let, apply, run) разумно

### Что НЕ делать
- ❌ Не удаляй старый код сразу — работай параллельно
- ❌ Не игнорируй edge cases из `.claude.md`
- ❌ Не делай тяжёлую работу в главном потоке (кроме Realm операций)
- ❌ Не смешивай слои архитектуры (презентация не должна знать о data source)
- ❌ Не используй hardcoded значения — выноси в константы/config

### Что обязательно делать
- ✅ Сверяйся с `.claude.md` на каждом этапе
- ✅ Обрабатывай все исключения
- ✅ Добавляй логирование критических операций
- ✅ Документируй нестандартные решения (особенно Realm workarounds)
- ✅ Тестируй каждый UseCase после создания

## СПЕЦИФИКА REALM

### Realm Threading Pattern
```kotlin
// В Repository (Data Layer)
class PhotoRepositoryImpl @Inject constructor(
    private val realm: Realm, // Inject realm instance
    private val photoMapper: PhotoDataMapper,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : PhotoRepository {
    
    override suspend fun savePhoto(photo: PhotoCapture): Result<Unit> {
        return try {
            // 1. Тяжёлая обработка в фоне
            val processedData = withContext(ioDispatcher) {
                processPhotoForStorage(photo)
            }
            
            // 2. Подготовка Realm объекта в фоне
            val realmObject = withContext(ioDispatcher) {
                photoMapper.toEntity(processedData)
            }
            
            // 3. Быстрая запись в главном потоке
            withContext(Dispatchers.Main) {
                realm.executeTransaction {
                    it.copyToRealmOrUpdate(realmObject)
                }
            }
            
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    override suspend fun getPhoto(id: String): Result<PhotoCapture?> {
        return withContext(Dispatchers.Main) {
            try {
                val entity = realm.where(PhotoEntity::class.java)
                    .equalTo("id", id)
                    .findFirst()
                
                val domainModel = entity?.let { photoMapper.toDomain(it) }
                Result.success(domainModel)
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
}
```

### Оптимизация Realm операций
- Группируй множественные записи в одну транзакцию
- Используй `copyToRealmOrUpdate` вместо check-then-insert
- Создавай индексы для часто запрашиваемых полей
- Закрывай Realm результаты после использования
- Минимизируй время держания транзакции открытой

## КРИТЕРИИ ГОТОВНОСТИ

Рефакторинг считается завершённым, когда:
- ✅ Весь функционал из legacy работает идентично
- ✅ Все тесты проходят
- ✅ Нет memory leaks (проверено LeakCanary)
- ✅ Нет ANR и jank на UI thread
- ✅ Код проходит code review checklist:
    - Соблюдены Clean Architecture принципы
    - MVI pattern реализован корректно
    - Все UseCase имеют single responsibility
    - Realm операции минимизированы в главном потоке
    - Обработаны все error cases
    - Добавлено логирование
    - Написаны unit тесты

## НАЧАЛО РАБОТЫ

**Первый шаг:**
1. Изучи файл `.claude.md` полностью
2. Покажи мне структуру каталогов, которую я подготовил
3. Предложи дополнения к структуре, если что-то упущено
4. Начни с создания Domain Layer — базовых моделей и UseCase интерфейсов

**После подтверждения структуры:**
Спрашивай меня перед каждым крупным шагом:
- "Начать создание [компонента]?"
- "Переходить к следующему этапу?"
- "Нужны ли дополнительные классы для [функциональности]?"

Поехали! Жду от тебя анализа `.claude.md` и предложений по структуре проекта.