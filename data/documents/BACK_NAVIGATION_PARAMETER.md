# Параметр backNavigationId для управления возвратом назад

**Дата:** 2025-12-19
**Статус:** Добавлено

---

## Описание

Добавлен параметр `backNavigationId` в `PhotoCaptureConfig` для управления навигацией при нажатии:
- Кнопки "Отмена" в UI
- Системной кнопки "Назад" Android

### Зачем это нужно?

В некоторых случаях требуется специальная навигация назад. Например:
- **AFTER_MEDIA**: При возврате нужно перейти на карту `navigateBack(FPMap.NAV_ID)`, а не на предыдущий экран
- **Другие кейсы**: Можно настроить возврат на любой экран в графе навигации

---

## Использование

### 1. В PhotoCaptureConfig

**Файл:** `PhotoCaptureConfig.kt:49-54`

```kotlin
data class PhotoCaptureConfig(
    // ... другие параметры

    /** ID экрана для навигации назад (кнопка "Отмена" / системная кнопка "Назад")
     * Если не null, используется navigateBack(backNavigationId)
     * Если null, используется обычный navigateUp()
     * Пример: для afterMedia нужно вернуться на карту - передаём FPMap.NAV_ID
     */
    val backNavigationId: Int? = null,

    // ... другие параметры
)
```

### 2. В PhotoCaptureConfigFactory

**Пример для AFTER_MEDIA** (`PhotoCaptureConfigFactory.kt:85-103`):

```kotlin
private fun createAfterMediaConfig(platformId: Int): PhotoCaptureConfig {
    return PhotoCaptureConfig(
        photoType = PhotoType.AFTER_MEDIA,
        // ... другие параметры
        navigationTarget = NavigationTarget.Screen(
            navId = NAV_NEXT_SCREEN,
            argumentId = platformId
        ),
        backNavigationId = R.id.FPMap  // ← Возврат на карту
    )
}
```

### 3. Обработка в Fragment

**Файл:** `PhotoCaptureFragment.kt:457-466`

```kotlin
is PhotoCaptureEffect.NavigateBack -> {
    val config = viewModel.state.value.config
    if (config?.backNavigationId != null) {
        // Используем navigateBack с указанным navId (например, для возврата на карту)
        findNavController().popBackStack(config.backNavigationId, false)
    } else {
        // Обычный возврат назад
        findNavController().navigateUp()
    }
}
```

---

## Примеры использования

### Возврат на карту (AFTER_MEDIA)

```kotlin
PhotoCaptureConfig(
    photoType = PhotoType.AFTER_MEDIA,
    // ...
    backNavigationId = R.id.FPMap  // Возврат на карту
)
```

**Поведение:**
- Нажатие "Отмена" → `popBackStack(R.id.FPMap)` → переход на карту
- Системная кнопка "Назад" → `popBackStack(R.id.FPMap)` → переход на карту

### Обычный возврат назад (по умолчанию)

```kotlin
PhotoCaptureConfig(
    photoType = PhotoType.BEFORE_MEDIA,
    // ...
    backNavigationId = null  // или не указываем (значение по умолчанию)
)
```

**Поведение:**
- Нажатие "Отмена" → `navigateUp()` → возврат на предыдущий экран
- Системная кнопка "Назад" → `navigateUp()` → возврат на предыдущий экран

### Возврат на произвольный экран

```kotlin
PhotoCaptureConfig(
    photoType = PhotoType.CUSTOM,
    // ...
    backNavigationId = R.id.CustomDestination  // Возврат на CustomDestination
)
```

**Поведение:**
- Нажатие "Отмена" → `popBackStack(R.id.CustomDestination)` → переход на CustomDestination
- Системная кнопка "Назад" → `popBackStack(R.id.CustomDestination)` → переход на CustomDestination

---

## Разница между navigationTarget и backNavigationId

| Параметр | Когда срабатывает | Назначение |
|----------|-------------------|------------|
| `navigationTarget` | При нажатии кнопки "Далее" после съёмки | Куда идти ВПЕРЁД после завершения съёмки |
| `backNavigationId` | При нажатии "Отмена" или системной кнопки "Назад" | Куда идти НАЗАД при отмене/выходе |

### Пример:

```kotlin
PhotoCaptureConfig(
    photoType = PhotoType.AFTER_MEDIA,
    // ...
    navigationTarget = NavigationTarget.Screen(
        navId = R.id.FPServe,        // ← ВПЕРЁД: на экран обслуживания
        argumentId = platformId
    ),
    backNavigationId = R.id.FPMap     // ← НАЗАД: на карту
)
```

**Результат:**
- Сделал фото → нажал "Далее" → переход на `FPServe`
- Сделал фото → нажал "Отмена" → переход на `FPMap` (карту)
- Открыл камеру → нажал системную кнопку "Назад" → переход на `FPMap` (карту)

---

## Технические детали

### popBackStack vs navigateUp

**`popBackStack(destinationId, inclusive)`:**
- Удаляет все экраны из back stack до `destinationId`
- `inclusive = false` - оставляет `destinationId` в стеке
- `inclusive = true` - удаляет и `destinationId` тоже
- Используется когда нужно вернуться на **конкретный экран** в графе

**`navigateUp()`:**
- Возвращается на **предыдущий экран** в back stack
- Эквивалентно `popBackStack()` без параметров
- Используется для обычного возврата назад

### Пример с popBackStack:

**Back stack:**
```
FPMap → FPServe → PhotoCaptureFragment
```

**При `popBackStack(R.id.FPMap, false)`:**
```
Удаляются: FPServe, PhotoCaptureFragment
Остаётся: FPMap ✅
```

**При `navigateUp()`:**
```
Удаляется: PhotoCaptureFragment
Остаётся: FPMap → FPServe
```

---

## Настройка для других типов фото

Если нужно добавить специальную навигацию назад для других типов, просто добавьте `backNavigationId` в соответствующий метод `create*Config()`:

```kotlin
private fun createCustomConfig(platformId: Int): PhotoCaptureConfig {
    return PhotoCaptureConfig(
        photoType = PhotoType.CUSTOM,
        // ...
        backNavigationId = R.id.TargetDestination  // ← Добавьте эту строку
    )
}
```

---

## Связанные файлы

- `PhotoCaptureConfig.kt:49-54` - параметр backNavigationId
- `PhotoCaptureFragment.kt:457-466` - обработка NavigateBack
- `PhotoCaptureConfigFactory.kt:101` - пример для AFTER_MEDIA

---

## Заключение

Параметр `backNavigationId` предоставляет гибкий механизм управления навигацией назад для разных типов фотосъёмки.

**По умолчанию** (если `backNavigationId = null`):
- Используется обычный `navigateUp()`

**При указании конкретного ID**:
- Используется `popBackStack(backNavigationId)` для перехода на нужный экран

✅ Настроено для AFTER_MEDIA - возврат на карту
✅ Можно легко настроить для других типов фото
