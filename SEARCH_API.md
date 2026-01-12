# 🔍 Улучшенный поиск и воспроизведение

## Что изменилось?

### 1. Комбинированный поиск
Теперь поиск работает с **обоими источниками одновременно**:
- **Локальная библиотека** - ваши загруженные файлы
- **Navidrome** - streaming сервер (guest/guest)

### 2. Результаты поиска
Результаты показывают:
- Название песни
- Имя артиста
- Обложка (если доступна)
- Источник (🌐 Navidrome или 📁 Local)

### 3. Воспроизведение в плеере
При клике на песню:
- ✅ Плеер обновляется с названием трека
- ✅ Показывается имя артиста
- ✅ Отображается обложка альбома
- ✅ Начинает играть музыка
- ✅ Для Navidrome: потоковое воспроизведение

## Функции API

### performCombinedSearch(query)
Основная функция поиска. Ищет одновременно в локальной библиотеке и Navidrome.

```javascript
// Пример использования:
const results = await window.performCombinedSearch("Starboy");

// Результаты:
// [
//   { id: 1, title: "Starboy", artist: "The Weeknd", source: "local", ... },
//   { navidromeId: "abc123", title: "Starboy", artist: "The Weeknd", source: "navidrome", ... }
// ]
```

### playNavidromeSong(songId, title, artist, album, cover)
Воспроизводит песню из Navidrome с обновлением UI.

```javascript
// Пример:
await window.playNavidromeSong(
  "song-id-from-navidrome",
  "Starboy",
  "The Weeknd",
  "Starboy",
  "https://..."
);
```

### getSongDetails(songId)
Получает полную информацию о песне из Navidrome.

```javascript
// Пример:
const details = await window.getSongDetails("song-id");
// { title, artist, album, duration, coverUrl }
```

### playTrack(id)
Воспроизводит локальную песню (как раньше).

```javascript
window.playTrack(1); // ID из локальной библиотеки
```

## Примеры использования

### Пример 1: Поиск и воспроизведение
```javascript
// Пользователь вводит "Starboy" в поиск
const results = await window.performCombinedSearch("Starboy");

// Система показывает:
// 📁 Starboy (The Weeknd) - локально
// 🌐 Starboy (The Weeknd) - из Navidrome
// 🌐 Starboy Remix - из Navidrome

// Пользователь кликает на Navidrome версию
// Система автоматически вызывает:
await window.playNavidromeSong(
  "navidrome-song-id",
  "Starboy",
  "The Weeknd",
  "Starboy",
  "https://navidrome.../art"
);

// Плеер обновляется:
// - Название: "Starboy"
// - Артист: "The Weeknd"
// - Обложка: загружается
// - Музыка: начинает играть
```

### Пример 2: Скрытое использование
При клике на песню в результатах поиска система автоматически:
1. Определяет тип источника (local или navidrome)
2. Вызывает правильную функцию воспроизведения
3. Обновляет UI плеера
4. Начинает воспроизведение

## Технические детали

### Структура результата поиска

**Локальная песня:**
```javascript
{
  id: 123,
  title: "Song Title",
  artist: "Artist Name",
  album: "Album Name",
  duration: 180,
  cover: "blob:...",
  url: "blob:...",
  source: "local"
}
```

**Песня из Navidrome:**
```javascript
{
  navidromeId: "abc123def456",
  title: "Song Title",
  artist: "Artist Name",
  album: "Album Name",
  duration: 180,
  cover: "https://navidrome/.../art",
  source: "navidrome"
}
```

### API endpoints Navidrome

- `search3.view` - поиск песен
- `getSong.view` - детали песни
- `getCoverArt.view` - загрузка обложек (size: 200-500px)
- `stream.view` - потоковое воспроизведение

Все с guest credentials: `u=guest&p=guest&v=1.16.1&c=Z-BETA&f=json`

## Оптимизация

### Кэширование
Метаданные песен не кэшируются (можно добавить если нужна оптимизация).

### Лимиты
- Максимум 50 результатов на запрос (можно изменить в коде)
- Таймаут запроса: стандартный fetch (~30 сек)

### Обложки
- Размер: 200px по умолчанию (экономит трафик)
- Fallback: стандартная картинка если нет обложки

## Дебаг

В консоли браузера можно видеть логи:

```
[SEARCH] Starting combined search for: Starboy
[SEARCH] Local results: 1
[SEARCH] Navidrome results: 3
[SEARCH] Total unique results: 4
[NAVIDROME] Found: 3 songs
[NAVIDROME] Playing: Starboy by The Weeknd
```

## Что дальше?

Можно добавить:
- ✓ Кэширование результатов поиска
- ✓ История поисков
- ✓ Рекомендации на основе истории
- ✓ Фильтрацию по типу (местно/streaming)
- ✓ Сортировку результатов
