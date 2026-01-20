# Исправления для персистентности песен Navidrome

## Проблема
Песни из Navidrome, которые проигрывались, исчезали из library, плейлистов и очереди после перезагрузки страницы.

## Решение

### 1. **Сохранение Navidrome песен в базе данных** ✅
**Файл:** [js/navidrome-search.js](js/navidrome-search.js#L260-L270)

Теперь при добавлении Navidrome песни в library она сохраняется в IndexedDB с полем `url`:
```javascript
window.db.songs.add({
  title: finalTitle,
  artist: finalArtist,
  album: finalAlbum,
  duration: songDetails?.duration || 0,
  url: streamUrl,           // ← Добавлено!
  cover: finalCoverUrl,
  source: 'navidrome',
  navidromeId: songId,
  isFavorite: false,
  order: 999999 + Math.random()
})
```

### 2. **Загрузка ВСЕХ песен при старте** ✅
**Файл:** [js/modules/library-manager.js](js/modules/library-manager.js#L4-L47)

Функция `loadLibraryFromDB()` теперь загружает:
- ✅ Локальные импортированные песни (с fileBlob)
- ✅ Песни Navidrome (с источником 'navidrome')

```javascript
// Загружаем ВСЕ песни: локальные и Navidrome
const allSongs = saved.map(s => {
    if (s.fileBlob) {
        // Локальные песни
        return { ...s, url: URL.createObjectURL(s.fileBlob), source: 'local' };
    } else if (s.source === 'navidrome' && s.navidromeId) {
        // Navidrome песни
        return { id: s.id, title: s.title, ... navidromeId: s.navidromeId, ... };
    }
    return null;
});
```

### 3. **Сохранение состояния очереди** ✅
**Файлы:** 
- [js/modules/library-manager.js](js/modules/library-manager.js#L131-L153) - функции сохранения
- [js/app.js](js/app.js#L727-L728) - вызов при смене трека

Новые функции:
- `saveQueueState()` - сохраняет текущий трек и индекс в localStorage
- `restoreQueueState()` - восстанавливает состояние при загрузке

```javascript
// Сохраняется при смене трека
window.playTrack = (id) => {
    // ...
    if (window.saveQueueState) window.saveQueueState();
    renderLibrary();
};
```

### 4. **Восстановление состояния при загрузке** ✅
**Файл:** [js/app.js](js/app.js#L1901-1904)

При загрузке library теперь также восстанавливается состояние очереди:
```javascript
await loadLibraryFromDB();
await restoreQueueState();  // ← Восстанавливаем очередь
```

## Результат

Теперь:
1. ✅ Песни из Navidrome сохраняются в БД после воспроизведения
2. ✅ При перезагрузке страницы все песни (локальные + Navidrome) загружаются обратно
3. ✅ Очередь воспроизведения восстанавливается (текущий трек и позиция)
4. ✅ Песни не исчезают из плейлистов (они там сохранены как `navidromeSongs`)
5. ✅ Музыка продолжает воспроизводиться с того же места после перезагрузки

## Чтобы протестировать:

1. Добавьте Navidrome песню в library через поиск
2. Нажмите play
3. Перезагрузите страницу (F5)
4. Песня и состояние очереди должны восстановиться ✅
