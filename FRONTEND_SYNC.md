# Frontend Синхронизация

## ⚠️ ВАЖНО: Две версии index.html больше не нужны!

Все файлы в `/workspaces/html-player/frontend/` теперь **идентичны** основной папке.

### Структура:

- **Основная папка** (`/workspaces/html-player/`) - используется `node server.js` на порту 3001
- **Frontend папка** (`/workspaces/html-player/frontend/`) - используется Live Server на порту 5500 и Docker

### Все файлы синхронизированы:

✅ `index.html` - основной HTML файл  
✅ `js/` - все JavaScript файлы  
✅ `css/` - все стили  
✅ `assets/` - иконки и ресурсы  
✅ `*.png`, `*.jpg` - картинки  
✅ `package.json` - зависимости  

### Если вы делаете изменения:

**ВСЕГДА** редактируйте файлы в основной папке `/workspaces/html-player/`:

```bash
# ✅ ДЕЛАЙТЕ ТАК:
# Редактируйте: /workspaces/html-player/index.html
# Редактируйте: /workspaces/html-player/js/app.js
# Редактируйте: /workspaces/html-player/css/main.css

# ❌ НЕ ДЕЛАЙТЕ ТАК:
# Редактируйте: /workspaces/html-player/frontend/index.html
# Редактируйте: /workspaces/html-player/frontend/js/app.js
```

### Синхронизация после изменений:

Если вы случайно отредактировали файлы в `frontend/` папке, синхронизируйте:

```bash
cp -r /workspaces/html-player/js/* /workspaces/html-player/frontend/js/
cp -r /workspaces/html-player/css/* /workspaces/html-player/frontend/css/
cp /workspaces/html-player/index.html /workspaces/html-player/frontend/index.html
```

### Проверка синхронизации:

```bash
diff /workspaces/html-player/index.html /workspaces/html-player/frontend/index.html
diff /workspaces/html-player/js/app.js /workspaces/html-player/frontend/js/app.js
```

Если нет вывода - файлы идентичны ✅
