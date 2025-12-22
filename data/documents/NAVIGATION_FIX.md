# Исправление ошибки навигации "null cannot be cast to non-null type kotlin.Int" ✅

**Дата:** 2025-12-19
**Обновлено:** 2025-12-19 (добавлено исправление для галереи)
**Статус:** Полностью исправлено

---

## Проблема

При нажатии кнопки "Далее" (Next) приложение падало с ошибкой:
```
java.lang.NullPointerException: null cannot be cast to non-null type kotlin.Int
	at androidx.navigation.NavType$Companion$IntType$1.get(NavType.kt:265)
	at ru.smartro.worknote.presentation.photo_camera.presentation.ui.capture.PhotoCaptureFragment.navigateToNext(PhotoCaptureFragment.kt:451)
```

### Причина

**Несоответствие между навигационными аргументами и nav_graph:**

1. **Nav Graph ожидает обязательный аргумент:**
   ```xml
   <!-- nav_graph.xml -->
   <fragment
       android:id="@+id/FPServe"
       android:name="ru.smartro.worknote.presentation.FPServeGroupByList">
       <argument
           android:name="ARGUMENT_NAME___PARAM_ID"
           app:argType="integer"/>  <!-- БЕЗ defaultValue = обязательный! -->
   </fragment>
   ```

2. **Factory создавал NavigationTarget без argumentId:**
   ```kotlin
   // ❌ НЕПРАВИЛЬНО
   navigationTarget = NavigationTarget.Screen(navId = NAV_NEXT_SCREEN)
   // argumentId = null по умолчанию
   ```

3. **Fragment не добавлял null аргументы в Bundle:**
   ```kotlin
   val bundle = Bundle().apply {
       argumentId?.let { putInt("ARGUMENT_NAME___PARAM_ID", it) }  // пропускается
       argumentName?.let { putString("ARGUMENT_NAME___PARAM_NAME", it) }
   }
   findNavController().navigate(navId, bundle)
   ```

4. **Navigation Component пытался получить обязательный аргумент:**
   - Bundle не содержит `ARGUMENT_NAME___PARAM_ID`
   - Navigation пытается получить значение
   - Получает `null`
   - Пытается cast к `Int` → **Crash!**

---

## Решение

### Добавлен platformId во все NavigationTarget.Screen

Исправлены все 15 методов в `PhotoCaptureConfigFactory` для передачи `platformId` как `argumentId`:

#### Было (❌):
```kotlin
private fun createBeforeMediaConfig(platformId: Int): PhotoCaptureConfig {
    return PhotoCaptureConfig(
        // ...
        navigationTarget = NavigationTarget.Screen(navId = NAV_NEXT_SCREEN)
        // argumentId отсутствует (null)
    )
}
```

#### Стало (✅):
```kotlin
private fun createBeforeMediaConfig(platformId: Int): PhotoCaptureConfig {
    return PhotoCaptureConfig(
        // ...
        navigationTarget = NavigationTarget.Screen(
            navId = NAV_NEXT_SCREEN,
            argumentId = platformId  // ✅ Передаём platformId
        )
    )
}
```

---

## Исправленные методы

Все 15 типов фото теперь передают `platformId`:

### Platform Media (6 типов)
1. ✅ `createBeforeMediaConfig` - передаёт `platformId`
2. ✅ `createAfterMediaConfig` - передаёт `platformId`
3. ✅ `createFailureMediaConfig` - передаёт `platformId`
4. ✅ `createFailureStartMediaConfig` - передаёт `platformId`
5. ✅ `createBreakdownPlatformConfig` - передаёт `platformId`
6. ✅ `createPickupMediaConfig` - передаёт `platformId`

### KGO Media (2 типа)
7. ✅ `createKgoServedConfig` - передаёт `platformId`
8. ✅ `createKgoRemainingConfig` - передаёт `platformId`

### Container Media (4 типа)
9. ✅ `createContainerBeforeConfig` - передаёт `platformId`
10. ✅ `createContainerBeforeByTypesConfig` - передаёт `platformId`
11. ✅ `createContainerFailureConfig` - передаёт `platformId`
12. ✅ `createBreakdownContainerConfig` - передаёт `platformId`

### Unload Media (3 типа)
13. ✅ `createUnloadBeforeConfig` - передаёт `platformId`
14. ✅ `createUnloadAfterConfig` - передаёт `platformId`
15. ✅ `createUnloadFailureConfig` - передаёт `platformId`

---

## Почему передаём platformId для контейнеров?

Для типов `CONTAINER_*` метод принимает и `platformId`, и `containerId`:
```kotlin
private fun createContainerBeforeConfig(platformId: Int, containerId: Int): PhotoCaptureConfig
```

Но в `navigationTarget` передаём **`platformId`**, а не `containerId`, потому что:

1. Целевой экран `FPServe` ожидает **ID платформы**
2. Контейнеры всегда принадлежат платформе
3. После съёмки фото контейнера возвращаемся к экрану обслуживания **платформы**
4. `entityId` в конфиге содержит `containerId` для сохранения фото
5. Но `argumentId` в навигации - это `platformId` для следующего экрана

---

## Поток навигации (исправленный)

```
User нажимает "Далее"
    ↓
PhotoCaptureViewModel.proceedToNext() [валидация OK]
    ↓
emit(PhotoCaptureEffect.NavigateToNext(
    navId = R.id.FPServe,
    argumentId = platformId,  // ✅ Теперь не null
    argumentName = null
))
    ↓
PhotoCaptureFragment.navigateToNext(navId, argumentId, argumentName)
    ↓
Bundle.apply {
    argumentId?.let { putInt("ARGUMENT_NAME___PARAM_ID", it) }  // ✅ Добавляется!
}
    ↓
Navigation.navigate(R.id.FPServe, bundle)
    ↓
FPServe получает ARGUMENT_NAME___PARAM_ID = platformId ✅
```

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `domain/factory/PhotoCaptureConfigFactory.kt` | Добавлен `argumentId = platformId` во все 15 методов; изменены пути на относительные |
| `data/source/camera/CameraDataSource.kt` | Преобразование относительных путей в абсолютные |
| `presentation/ui/capture/PhotoCaptureContract.kt` | Добавлен `entityId` в `NavigateToGallery` effect |
| `presentation/ui/capture/PhotoCaptureViewModel.kt` | Передача `config.entityId` при навигации в галерею |
| `presentation/ui/capture/PhotoCaptureFragment.kt` | Использование `ARGUMENT_NAME___PARAM_NAME` для директории |

---

## Дополнительное исправление: Навигация в галерею

### Проблема 2

После исправления кнопки "Далее", обнаружилась та же проблема при нажатии на **счётчик фото** (кнопку галереи).

**Галерея тоже ожидает обязательный аргумент:**
```xml
<!-- nav_graph.xml -->
<fragment
    android:id="@+id/GalleryPhotoF"
    android:name="ru.smartro.worknote.presentation.photo.presentation.APhotoGalleryF">
    <argument
        android:name="ARGUMENT_NAME___PARAM_ID"
        app:argType="integer"/>  <!-- Обязательный! -->
</fragment>
```

**Но передавалась только директория:**
```kotlin
// ❌ БЫЛО
data class NavigateToGallery(val directory: String) : PhotoCaptureEffect()

private fun navigateToGallery(directory: String) {
    val bundle = Bundle().apply {
        putString("directoryPath", directory)  // Нет ARGUMENT_NAME___PARAM_ID
    }
    findNavController().navigate(R.id.GalleryPhotoF, bundle)
}
```

### Решение 2

Добавлен `entityId` в навигацию галереи:

#### 1. Обновлён Effect
```kotlin
// ✅ СТАЛО
data class NavigateToGallery(
    val directory: String,
    val entityId: Int  // ✅ Добавлен
) : PhotoCaptureEffect()
```

#### 2. Обновлён ViewModel
```kotlin
private fun openGallery() {
    viewModelScope.launch {
        _effect.emit(PhotoCaptureEffect.NavigateToGallery(
            directory = config.directoryPath,
            entityId = config.entityId  // ✅ Передаём из config
        ))
    }
}
```

#### 3. Обновлён Fragment
```kotlin
private fun navigateToGallery(directory: String, entityId: Int) {
    val bundle = Bundle().apply {
        putString("ARGUMENT_NAME___PARAM_NAME", directory)  // ✅ Правильный ключ
        putInt("ARGUMENT_NAME___PARAM_ID", entityId)  // ✅ Добавлен
    }
    findNavController().navigate(R.id.GalleryPhotoF, bundle)
}
```

**ВАЖНО:** Галерея ожидает директорию в аргументе `ARGUMENT_NAME___PARAM_NAME`, а не в `directoryPath`!

---

## Дополнительное исправление 2: Относительные vs абсолютные пути

### Проблема 3

После исправления ключа аргумента, галерея открывалась, но показывала **чёрный экран** (не находила фото).

**Причина:** Несоответствие формата путей:
- Factory создавал **абсолютные** пути: `/storage/.../photo/123/beforeMedia`
- Галерея ожидала **относительные** пути: `photo/123/beforeMedia`
- Галерея вызывает `getDFileList(directory)`, который добавляет `dataDir` к пути
- Получался неправильный путь: `dataDir + абсолютный_путь`

### Решение 3

#### 1. Factory возвращает относительные пути

```kotlin
// ✅ СТАЛО - относительные пути
private fun getPhotoDirectory(platformId: Int, mediaType: String): String {
    return "photo${File.separator}$platformId${File.separator}$mediaType"
}
```

**Было:**
```kotlin
// ❌ БЫЛО - абсолютные пути
private fun getPhotoDirectory(platformId: Int, mediaType: String): String {
    val basePath = App.getAppliCation().getDPath("")
    return "$basePath${File.separator}photo${File.separator}$platformId${File.separator}$mediaType"
}
```

#### 2. CameraDataSource преобразует пути

```kotlin
// Преобразование относительного пути в абсолютный
val absolutePath = if (File(outputDirectory).isAbsolute) {
    outputDirectory
} else {
    App.getAppliCation().getDPath(outputDirectory)
}

val directory = File(absolutePath)
if (!directory.exists()) {
    directory.mkdirs()
}
```

Теперь:
- **Factory** возвращает относительные пути (совместимо с галереей)
- **CameraDataSource** преобразует их в абсолютные (для создания файлов)
- **Галерея** получает относительные пути и правильно их обрабатывает

---

## Тестирование

### Manual QA Checklist

#### Кнопка "Далее" (Next)
- [x] Съёмка фото платформы "до" → нажатие "Далее" → навигация на FPServe
- [x] Съёмка фото платформы "после" → нажатие "Далее" → навигация на FPServe
- [x] Съёмка фото при отказе → нажатие "Далее" → навигация на FPServe
- [x] Съёмка фото контейнера → нажатие "Далее" → навигация на FPServe
- [x] Съёмка фото выгрузки → нажатие "Далее" → навигация на FPServe
- [x] Все типы фото корректно передают platformId

#### Счётчик фото / Галерея
- [x] Нажатие на счётчик фото → открывается галерея
- [x] Галерея получает правильный entityId
- [x] Галерея отображает фото из правильной директории
- [x] Для платформ передаётся platformId
- [x] Для контейнеров передаётся containerId
- [x] Для выгрузок передаётся platformId

---

## Альтернативные решения (не выбраны)

### Вариант 1: Сделать аргумент nullable в nav_graph

```xml
<argument
    android:name="ARGUMENT_NAME___PARAM_ID"
    app:argType="integer"
    app:nullable="true"/>  <!-- Сделать nullable -->
```

**Не выбрали, потому что:**
- FPServe **требует** platformId для работы
- Nullable аргумент - неправильный контракт
- Нужно было бы обрабатывать null во всех местах

### Вариант 2: Добавить defaultValue

```xml
<argument
    android:name="ARGUMENT_NAME___PARAM_ID"
    app:argType="integer"
    android:defaultValue="-1"/>
```

**Не выбрали, потому что:**
- -1 - магическое число
- Маскирует реальную проблему (отсутствие ID)
- Может привести к неожиданному поведению

### ✅ Выбранное решение: Передавать правильный ID

Это **правильное** решение, потому что:
- Явная передача нужных данных
- Соответствие контракту nav_graph
- Нет магических значений
- Код становится понятнее

---

## Заключение

Проблема **полностью исправлена**! ✅

### Достижения:
- ✅ Навигация работает для всех 15 типов фото
- ✅ Правильная передача platformId в следующий экран (кнопка "Далее")
- ✅ Правильная передача entityId в галерею (счётчик фото)
- ✅ Соответствие контракту nav_graph для всех экранов
- ✅ Нет crash при нажатии "Далее"
- ✅ Нет crash при открытии галереи
- ✅ Контейнеры корректно возвращаются к экрану платформы

**Вся навигация теперь работает корректно!** 🎉✨
