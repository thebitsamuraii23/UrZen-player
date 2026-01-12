// Главная точка входа приложения
import { state, dom, initDOM } from './state.js';
import { initAuth } from './auth.js';
import { searchLocalLibrary } from './navidrome-search.js';

// Константы и переводы
const I18N = {
    ru: {
        library: "Фонотека", favorites: "Любимое", playlists: "Коллекции",
        settings: "Настройки", queue: "Очередь", ready: "Выберите трек",
        language: "Локализация", bass_boost: "Ультра-бас", reset_db: "Удалить данные",
        create_playlist: "Новая коллекция", save: "Создать", cancel: "Отмена",
        import: "Ресурсы", add_files: "Загрузить треки", navigation: "Разделы",
        choose_playlist: "Добавить в плейлист", added: "Успешно добавлено!", 
        already_exists: "Трек уже в списке", removed: "Удалено",
        zen_exit_hint: "Нажмите ESC, чтобы выйти из Zen Mode",
        rename_playlist: "Переименовать коллекцию", confirm: "Подтвердить", delete: "Удалить",
        delete_playlist: "Удалить коллекцию?", delete_playlist_confirm: "Это действие нельзя отменить",
        renamed: "Переименовано", deleted: "Удалено",
        clear_queue: "Очистить очередь", queue_cleared: "Очередь очищена",
        music_search: "Поиск музыки", auth_required: "Требуется авторизация",
        login_to_search: "Вход для поиска и потокового воспроизведения музыки из Navidrome"
    },
    en: {
        library: "Library", favorites: "Favorites", playlists: "Playlists",
        settings: "Settings", queue: "Queue", ready: "Select Media",
        language: "Localization", bass_boost: "Bass Boost", reset_db: "Wipe Data",
        create_playlist: "New Collection", save: "Create", cancel: "Cancel",
        import: "Resources", add_files: "Import Tracks", navigation: "Sections",
        choose_playlist: "Add to Playlist", added: "Success Added!", 
        already_exists: "Track already exists", removed: "Removed",
        zen_exit_hint: "Press ESC to exit Zen Mode",
        rename_playlist: "Rename Playlist", confirm: "Confirm", delete: "Delete",
        delete_playlist: "Delete Playlist?", delete_playlist_confirm: "This action cannot be undone",
        renamed: "Renamed", deleted: "Deleted",
        clear_queue: "Clear Queue", queue_cleared: "Queue cleared",
        music_search: "Music Search", auth_required: "Authentication Required",
        login_to_search: "Sign in to search and stream music from Navidrome"
    }
};

// Инициализация БД
const db = new Dexie("AetherProDB");
db.version(7).stores({
    songs: "++id, title, artist, isFavorite, order",
    playlists: "++id, name",
    settings: "key"
});

// ============ УТИЛИТЫ ============
function refreshIcons() { 
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function formatTime(s) {
    const m = Math.floor(s/60); const sec = Math.floor(s%60);
    return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg; t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
}

// ============ НАСТРОЙКИ ============
async function loadSettings() {
    const lang = await db.settings.get('language');
    if (lang) state.lang = lang.value;
    else if (localStorage.getItem('language')) state.lang = localStorage.getItem('language');
    document.getElementById('langSelect').value = state.lang;
    
    const bass = await db.settings.get('bassEnabled');
    if (bass !== undefined) state.bassEnabled = bass.value;
    else if (localStorage.getItem('bassEnabled')) state.bassEnabled = localStorage.getItem('bassEnabled') === 'true';
    dom.bassCheck.checked = state.bassEnabled;
    
    const bGain = await db.settings.get('bassGain');
    if (bGain !== undefined) state.bassGain = bGain.value;
    else if (localStorage.getItem('bassGain')) state.bassGain = parseFloat(localStorage.getItem('bassGain'));
    // set slider value and apply visual fill
    dom.bassSlider.value = state.bassGain;
    updateBassGain(state.bassGain);

    const shuff = await db.settings.get('shuffle');
    if (shuff !== undefined) state.shuffle = shuff.value;
    else if (localStorage.getItem('shuffle')) state.shuffle = localStorage.getItem('shuffle') === 'true';

    const rep = await db.settings.get('repeat');
    if (rep !== undefined) state.repeat = rep.value;
    else if (localStorage.getItem('repeat')) state.repeat = localStorage.getItem('repeat');
    
    // Загружаем последний открытый таб
    const tab = localStorage.getItem('currentTab');
    if (tab) {
        try {
            state.currentTab = JSON.parse(tab);
        } catch (e) {
            state.currentTab = 'all';
        }
    }
    
    // Загружаем Navidrome избранное
    const navFavorites = localStorage.getItem('navidromeFavorites');
    if (navFavorites) {
        try {
            window.navidromeFavorites = JSON.parse(navFavorites);
        } catch (e) {
            window.navidromeFavorites = [];
        }
    }
    
    // Загружаем недавно открытые Navidrome песни
    const navidromeSongs = localStorage.getItem('navidromeSongs');
    if (navidromeSongs) {
        try {
            const songs = JSON.parse(navidromeSongs);
            console.log('[SETTINGS] Loading', songs.length, 'Navidrome songs from localStorage');
            if (Array.isArray(songs)) {
                state.library = state.library || [];
                // Add Navidrome songs that aren't already in the library
                songs.forEach(song => {
                    if (!state.library.some(s => s.navidromeId === song.navidromeId)) {
                        state.library.push(song);
                    }
                });
            }
        } catch (e) {
            console.error('[SETTINGS] Error loading Navidrome songs:', e);
        }
    }
}

function applyLanguage() {
    const t = I18N[state.lang];
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        if (t[key]) el.innerText = t[key];
    });
    refreshIcons();
}

window.changeLanguage = async (val) => {
    state.lang = val;
    await db.settings.put({key: 'language', value: val});
    localStorage.setItem('language', val);
    applyLanguage();
};

// ============ МОДАЛЬНЫЕ ОКНА ============
window.toggleModal = (id) => { 
    document.getElementById(id).classList.toggle('active'); 
};

window.toggleSettings = () => { window.toggleModal('settingsModal'); };
window.togglePlaylistModal = () => { window.toggleModal('playlistModal'); };
window.closePlaylistPicker = () => { window.toggleModal('playlistPickerOverlay'); };

// ============ БАС И ЗВУК ============
window.toggleBassBoost = (enabled) => {
    state.bassEnabled = enabled;
    db.settings.put({key: 'bassEnabled', value: enabled});
    if (enabled) dom.bassPanel.classList.remove('disabled');
    else dom.bassPanel.classList.add('disabled');
    if (state.bassFilter) state.bassFilter.gain.value = enabled ? state.bassGain : 0;
};

window.updateBassGain = (val) => {
    state.bassGain = val;
    dom.bassValText.innerText = val + "dB";
    db.settings.put({key: 'bassGain', value: val});
    if (state.bassFilter && state.bassEnabled) state.bassFilter.gain.value = val;
    try {
        // visually fill the slider: orange fill for value portion, black for the rest
        const max = parseFloat(dom.bassSlider.max) || 25;
        const pct = Math.max(0, Math.min(1, parseFloat(val) / max)) * 100;
        dom.bassSlider.style.background = `linear-gradient(90deg, #ff8c00 0%, #ff8c00 ${pct}%, #000 ${pct}%, #000 100%)`;
    } catch (e) {
        // ignore styling errors in older browsers
    }
};

// ============ ПЛЕЙЛИСТ И БИБЛИОТЕКА ============
async function loadPlaylistsFromDB() {
    state.playlists = await db.playlists.toArray();
    renderPlaylistNav();
}

function renderPlaylistNav() {
    const containers = [document.getElementById('playlistNav'), document.getElementById('playlistNav-mobile')];
    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = "";
        
        // Add Navidrome menu item
        const navdiv = document.createElement('div');
        navdiv.id = container.id === 'playlistNav' ? 'nav-navidrome' : 'nav-navidrome-mobile';
        navdiv.className = `nav-item ${state.currentTab === 'navidrome' ? 'active' : ''}`;
        navdiv.innerHTML = `<i data-lucide="radio"></i><span style="flex-grow: 1;">Navidrome</span>`;
        navdiv.onclick = (e) => { 
            e.stopPropagation(); 
            window.switchTab('navidrome');
            if (window.innerWidth <= 1024) window.closeMobileMenu();
        };
        container.appendChild(navdiv);
        
        // Add playlists
        state.playlists.forEach(pl => {
            const div = document.createElement('div');
            div.className = `nav-item ${state.currentTab === pl.id ? 'active' : ''}`;
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = pl.name;
            nameSpan.style.flexGrow = '1';
            nameSpan.onclick = (e) => { 
                e.stopPropagation(); 
                window.switchTab(pl.id);
                if (window.innerWidth <= 1024) window.closeMobileMenu();
            };

            div.innerHTML = `<i data-lucide="music-2"></i>`;
            div.appendChild(nameSpan);

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '8px';

            actions.innerHTML = `
                <i data-lucide="pencil" style="width:16px; cursor:pointer;" onclick="event.stopPropagation(); window.renamePlaylist(${pl.id}, '${pl.name}')"></i>
                <i data-lucide="trash-2" style="width:16px; cursor:pointer;" onclick="event.stopPropagation(); window.deletePlaylist(${pl.id})"></i>
            `;
            
            div.appendChild(actions);
            container.appendChild(div);
        });
    });
    refreshIcons();
}

window.saveNewPlaylist = async () => {
    const name = document.getElementById('playlistNameInp').value;
    if (!name) return;
    await db.playlists.add({ name, songIds: [] });
    document.getElementById('playlistNameInp').value = "";
    window.togglePlaylistModal();
    await loadPlaylistsFromDB();
};

window.deletePlaylist = (id) => {
    deleteData.playlistId = id;
    window.toggleModal('deletePlaylistModal');
};

window.confirmDeletePlaylist = async () => {
    const id = deleteData.playlistId;
    if (!id) return;
    
    await db.playlists.delete(id);
    await loadPlaylistsFromDB();
    if (state.currentTab === id) window.switchTab('all');
    
    deleteData.playlistId = null;
    window.toggleModal('deletePlaylistModal');
    showToast(I18N[state.lang].deleted || 'Deleted');
};

window.cancelDeletePlaylist = () => {
    deleteData.playlistId = null;
    window.toggleModal('deletePlaylistModal');
};

window.renamePlaylist = (id, oldName) => {
    renameData.playlistId = id;
    renameData.oldName = oldName;
    document.getElementById('renamePlaylistInput').value = oldName;
    window.toggleModal('renamePlaylistModal');
};

window.confirmRenamePlaylist = async () => {
    const id = renameData.playlistId;
    const oldName = renameData.oldName;
    const newName = document.getElementById('renamePlaylistInput').value.trim();
    
    if (!newName || newName === oldName) {
        window.cancelRenamePlaylist();
        return;
    }
    
    await db.playlists.update(id, { name: newName });
    await loadPlaylistsFromDB();
    
    renameData.playlistId = null;
    renameData.oldName = null;
    window.toggleModal('renamePlaylistModal');
    showToast(I18N[state.lang].renamed || 'Renamed');
};

window.cancelRenamePlaylist = () => {
    document.getElementById('renamePlaylistInput').value = '';
    renameData.playlistId = null;
    renameData.oldName = null;
    window.toggleModal('renamePlaylistModal');
};

async function loadLibraryFromDB() {
    const saved = await db.songs.toArray();
    saved.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // Сохраняем Navidrome песни перед перезагрузкой
    const navidromeSongs = state.library.filter(s => s.source === 'navidrome');
    
    // Очищаем старые Object URLs от локальных песен
    state.library.forEach(s => {
        if (s.source !== 'navidrome' && s.url) {
            URL.revokeObjectURL(s.url);
        }
    });
    
    // Загружаем локальные песни и объединяем с Navidrome
    const localSongs = saved.map(s => ({ ...s, url: URL.createObjectURL(s.fileBlob) }));
    state.library = [...localSongs, ...navidromeSongs];
    
    console.log('[LIBRARY] Loaded', localSongs.length, 'local songs and kept', navidromeSongs.length, 'Navidrome songs');
    renderLibrary();
}

function getCurrentListView() {
    let list = state.library;
    if (state.currentTab === 'fav') {
        list = state.library.filter(t => t.isFavorite);
    }
    else if (state.currentTab === 'navidrome') {
        // Показываем только Navidrome песни
        list = state.library.filter(t => t.source === 'navidrome');
    }
    else if (typeof state.currentTab === 'number') {
        const pl = state.playlists.find(p => p.id === state.currentTab);
        if (pl) {
            // Объединяем локальные и Navidrome песни из плейлиста
            const localSongs = state.library.filter(t => pl.songIds && pl.songIds.includes(t.id));
            const navidromeSongs = pl.navidromeSongs || [];
            list = [...localSongs, ...navidromeSongs];
        }
    }
    // Apply search filter if present
    if (state.searchQuery && state.searchQuery.trim().length > 0) {
        const q = state.searchQuery.toLowerCase();
        list = list.filter(t => (t.title || '').toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q));
    }
    return list;
}

function renderLibrary() {
    dom.playlist.innerHTML = "";
    let list = getCurrentListView();

    list.forEach((track, index) => {
        const currentTrack = state.currentIndex !== -1 ? state.library[state.currentIndex] : null;
        const isActive = currentTrack && (currentTrack.id === track.id || currentTrack.navidromeId === track.navidromeId);
        const div = document.createElement('div');
        div.className = `song-item ${isActive ? 'active' : ''}`;
        div.draggable = true;
        div.dataset.id = track.id || track.navidromeId;
        
        const trackId = track.id || track.navidromeId;
        const source = track.source || 'local';
        
        const removeFromPlaylistBtn = (typeof state.currentTab === 'number') ?
            `<button class="mini-btn" onclick="event.stopPropagation(); window.removeSongFromPlaylist(${state.currentTab}, '${trackId}', '${source}')" title="Remove from playlist"><i data-lucide="minus-square"></i></button>` : '';

        // Экранируем кавычки для безопасности
        const safeTitle = (track.title || '').replace(/'/g, "\\'");
        const safeArtist = (track.artist || '').replace(/'/g, "\\'");
        const safeAlbum = (track.album || '').replace(/'/g, "\\'");
        const safeCover = (track.cover || '').replace(/'/g, "\\'");

        let onClickHandler;
        if (source === 'navidrome') {
            onClickHandler = `window.playNavidromeSong('${trackId}', '${safeTitle}', '${safeArtist}', '${safeAlbum}', '${safeCover}')`;
        } else {
            onClickHandler = `window.playTrack(${trackId})`;
        }

        div.innerHTML = `
            <img src="${track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'}" onerror="this.src='https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'">
            <div class="song-item-info" title="${track.title}&#10;${track.artist}">
                <h4>${track.title}${source === 'navidrome' ? ' 🌐' : ''}</h4>
                <p>${track.artist}</p>
            </div>
            <div class="song-actions">
                <button class="mini-btn" onclick="event.stopPropagation(); window.openPlaylistPickerMulti('${trackId}', '${source}')"><i data-lucide="plus"></i></button>
                <button class="mini-btn" onclick="event.stopPropagation(); window.toggleFav('${trackId}', '${source}')"><i data-lucide="heart" style="fill: ${track.isFavorite?'var(--accent)':'none'}; color: ${track.isFavorite?'var(--accent)':'currentColor'}"></i></button>
                ${removeFromPlaylistBtn}
                <button class="mini-btn danger" onclick="event.stopPropagation(); window.deleteTrack('${trackId}', '${source}')"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        div.onclick = () => { eval(onClickHandler); };

        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);

        dom.playlist.appendChild(div);
    });
    refreshIcons();
    renderSidebarQueue();
}

function handleDragStart(e) {
    state.draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

async function handleDrop(e) {
    e.preventDefault();
    if (this !== state.draggedItem) {
        const draggedId = parseInt(state.draggedItem.dataset.id);
        const targetId = parseInt(this.dataset.id);
        
        const draggedIdx = state.library.findIndex(t => t.id === draggedId);
        const targetIdx = state.library.findIndex(t => t.id === targetId);
        
        const [movedTrack] = state.library.splice(draggedIdx, 1);
        state.library.splice(targetIdx, 0, movedTrack);

        await Promise.all(state.library.map((track, idx) => {
            return db.songs.update(track.id, { order: idx });
        }));

        renderLibrary();
    }
}

function handleDragEnd() {
    this.classList.remove('dragging');
    state.draggedItem = null;
}

function renderSearchResults(results) {
    dom.playlist.innerHTML = "";
    
    if (!results || results.length === 0) {
        dom.playlist.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No results found</div>';
        return;
    }

    results.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = 'song-item';
        const trackId = track.source === 'navidrome' ? track.navidromeId : track.id;
        div.dataset.id = trackId || `result-${index}`;
        
        const coverImg = track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100';
        
        // Create proper click handler
        const onClickHandler = () => {
            if (track.source === 'navidrome') {
                window.playNavidromeSong(
                    track.navidromeId, 
                    track.title, 
                    track.artist, 
                    track.album || '', 
                    track.cover || ''
                );
            } else {
                // For local songs, find the actual song object from library
                const localSong = window.state.library.find(s => s.id === track.id);
                if (localSong) {
                    window.playTrack(localSong.id);
                }
            }
        };

        // Store track temporarily for search results (for add to playlist, favorites, etc.)
        const tempTrackKey = `temp_${track.source}_${trackId}`;
        window.tempSearchTracks = window.tempSearchTracks || {};
        window.tempSearchTracks[tempTrackKey] = track;

        const safeTitle = (track.title || '').replace(/'/g, "\\'");
        const safeArtist = (track.artist || '').replace(/'/g, "\\'");
        const safeAlbum = (track.album || '').replace(/'/g, "\\'");
        const safeCover = (track.cover || '').replace(/'/g, "\\'");

        let playButtonAction;
        if (track.source === 'navidrome') {
            playButtonAction = `window.playNavidromeSong('${trackId}', '${safeTitle}', '${safeArtist}', '${safeAlbum}', '${safeCover}')`;
        } else {
            playButtonAction = `window.playTrack(${trackId})`;
        }

        div.innerHTML = `
            <img src="${coverImg}" alt="${track.title || 'Unknown'}" onerror="this.src='https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'">
            <div class="song-item-info" title="${track.title}&#10;${track.artist}">
                <h4>${track.title || 'Unknown'}${track.source === 'navidrome' ? ' 🌐' : ''}</h4>
                <p>${track.artist || 'Unknown Artist'}</p>
            </div>
            <div class="song-actions">
                <button class="mini-btn" onclick="event.stopPropagation(); window.addSearchResultToPlaylist('${trackId}', '${track.source}')"><i data-lucide="plus"></i></button>
                <button class="mini-btn" onclick="event.stopPropagation(); window.toggleFavSearchResult('${trackId}', '${track.source}')"><i data-lucide="heart" style="fill: none; color: currentColor"></i></button>
                <button class="mini-btn" onclick="event.stopPropagation(); ${playButtonAction}"><i data-lucide="play"></i></button>
            </div>
        `;
        
        div.onclick = onClickHandler;

        dom.playlist.appendChild(div);
    });
    
    refreshIcons();
}

window.deleteTrack = async (id, source = 'local') => {
    const currentTrack = state.currentIndex !== -1 ? state.library[state.currentIndex] : null;
    const isCurrentTrack = currentTrack && (currentTrack.id === id || currentTrack.navidromeId === id);
    
    if (isCurrentTrack) {
        dom.audio.pause();
        state.currentIndex = -1;
        resetUI();
    }
    
    // Удалить из состояния
    state.library = state.library.filter(t => !(t.id === id || t.navidromeId === id));
    
    // Если локальная песня, удалить из БД
    if (source === 'local') {
        await db.songs.delete(id);
    }
    
    renderLibrary();
    renderSidebarQueue();
};

function resetUI() {
    dom.trackName.innerText = "Select Media";
    dom.artistName.innerText = "";
    dom.mainCover.src = "";
    dom.vinylContainer.classList.remove('visible');
    updatePlayIcon(false);
}

window.toggleFav = async (id, source = 'local') => {
    const track = state.library.find(t => t.id === id || t.navidromeId === id);
    if (!track) return;
    
    track.isFavorite = !track.isFavorite;
    
    if (source === 'local') {
        await db.songs.update(id, { isFavorite: track.isFavorite });
    } else {
        // Для Navidrome песен сохраняем в localStorage
        const favorites = JSON.parse(localStorage.getItem('navidromeFavorites') || '[]');
        if (track.isFavorite) {
            if (!favorites.find(f => f.navidromeId === id)) {
                favorites.push(track);
            }
        } else {
            const idx = favorites.findIndex(f => f.navidromeId === id);
            if (idx !== -1) favorites.splice(idx, 1);
        }
        localStorage.setItem('navidromeFavorites', JSON.stringify(favorites));
    }
    
    renderLibrary();
};

function renderSidebarQueue() {
    const containers = [document.getElementById('sidebarQueueList'), document.getElementById('sidebarQueueList-mobile')];
    
    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = '';
        
        const queue = getCurrentListView();
        
        if (queue.length === 0) {
            container.innerHTML = '<div style="color:var(--text-dim); font-size:13px; padding:12px;">Queue is empty</div>';
            return;
        }

        queue.forEach((track) => {
            const currentTrack = state.currentIndex !== -1 ? state.library[state.currentIndex] : null;
            const isActive = currentTrack && (currentTrack.id === track.id || currentTrack.navidromeId === track.navidromeId);
            const trackId = track.id || track.navidromeId;
            const source = track.source || 'local';
            
            const div = document.createElement('div');
            div.className = `song-item${isActive ? ' active' : ''}`;
            div.style.cursor = 'pointer';
            
            const safeTitle = (track.title || '').replace(/'/g, "\\'");
            const safeArtist = (track.artist || '').replace(/'/g, "\\'");
            const safeAlbum = (track.album || '').replace(/'/g, "\\'");
            const safeCover = (track.cover || '').replace(/'/g, "\\'");
            
            let onClickHandler;
            if (source === 'navidrome') {
                onClickHandler = `window.playNavidromeSong('${trackId}', '${safeTitle}', '${safeArtist}', '${safeAlbum}', '${safeCover}')`;
            } else {
                onClickHandler = `window.playTrack(${trackId})`;
            }
            
            div.innerHTML = `
                <img src="${track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'}" onerror="this.src='https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'">
                <div class="song-item-info">
                    <h4>${track.title}${source === 'navidrome' ? ' 🌐' : ''}</h4>
                    <p>${track.artist}</p>
                </div>
            `;
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.ctrlKey || e.metaKey) {
                    window.toggleTrackSelection(trackId);
                    renderSidebarQueue();
                    refreshIcons();
                } else {
                    eval(onClickHandler);
                }
                });
                // Add button to add selected tracks to playlist if any are selected
                if (state.selectedTracks.size > 0) {
                    const addSelectedBtn = document.createElement('button');
                    addSelectedBtn.style.cssText = `
                        width: 100%;
                        margin-top: 12px;
                        padding: 10px;
                        background: var(--accent);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 13px;
                        transition: 0.3s;
                    `;
                    addSelectedBtn.textContent = `Add ${state.selectedTracks.size} track(s) to playlist`;
                    addSelectedBtn.onmouseover = () => addSelectedBtn.style.opacity = '0.9';
                    addSelectedBtn.onmouseout = () => addSelectedBtn.style.opacity = '1';
                    addSelectedBtn.onclick = () => window.openPlaylistPickerMultiSelect();
                    container.appendChild(addSelectedBtn);
                }
            container.appendChild(div);
        });
    });
}

// ============ ПЛЕЕР ============
window.playTrack = (id) => {
    const track = state.library.find(t => t.id === id || t.navidromeId === id);
    if (!track) {
        console.error('Track not found:', id);
        return;
    }
    state.currentIndex = state.library.findIndex(t => t.id === id || t.navidromeId === id);
    
    // Если shuffle включен, пересоздать порядок начиная с этого трека
    if (state.shuffle) {
        generateShuffleOrder();
        state.shufflePosition = 0;
    }
    
    dom.audio.src = track.url;
    dom.audio.play();
    dom.trackName.innerText = track.title;
    dom.artistName.innerText = track.artist;
    if (track.cover) {
        dom.mainCover.src = track.cover;
        dom.vinylContainer.classList.add('visible');
    } else {
        dom.vinylContainer.classList.remove('visible');
    }
    renderLibrary();
};

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Создать перемешанный порядок для текущего плейлиста/очереди
function generateShuffleOrder() {
    const view = getCurrentListView();
    if (view.length === 0) return;
    
    // Создать массив индексов и перемешать его
    const indices = Array.from({ length: view.length }, (_, i) => i);
    state.shuffledOrder = shuffleArray(indices);
    state.shufflePosition = 0;
    console.log('[SHUFFLE] Generated shuffle order:', state.shuffledOrder);
}

window.nextTrack = () => {
    const view = getCurrentListView();
    if (view.length === 0) return;

    if (state.repeat === 'one') {
        dom.audio.currentTime = 0;
        dom.audio.play();
        return;
    }

    let nextTrack;

    if (state.shuffle) {
        // Если shuffle порядок не создан или не совпадает с текущей очередью, создать его
        if (state.shuffledOrder.length !== view.length || state.shufflePosition === state.shuffledOrder.length) {
            if (state.repeat === 'all' && state.shufflePosition === state.shuffledOrder.length) {
                // Начать заново с перемешанным порядком
                generateShuffleOrder();
            } else if (state.shuffledOrder.length !== view.length) {
                // Очередь изменилась, переиндексировать
                generateShuffleOrder();
            }
        }

        // Получить индекс следующей песни из перемешанного порядка
        if (state.shufflePosition < state.shuffledOrder.length) {
            const nextIdx = state.shuffledOrder[state.shufflePosition];
            nextTrack = view[nextIdx];
            state.shufflePosition++;
            console.log('[SHUFFLE] Playing position', state.shufflePosition - 1, 'index', nextIdx);
        } else {
            return;
        }
    } else {
        // Обычное воспроизведение в порядке
        const currentTrack = state.library[state.currentIndex];
        const currentTrackId = currentTrack?.id || currentTrack?.navidromeId;
        const idxInView = view.findIndex(t => (t.id || t.navidromeId) === currentTrackId);

        if (idxInView < view.length - 1) {
            nextTrack = view[idxInView + 1];
        } else if (state.repeat === 'all') {
            nextTrack = view[0];
        } else {
            return;
        }
    }

    if (nextTrack.source === 'navidrome') {
        window.playNavidromeSong(nextTrack.navidromeId, nextTrack.title, nextTrack.artist, nextTrack.album, nextTrack.cover);
    } else {
        window.playTrack(nextTrack.id);
    }
};

window.prevTrack = () => {
    const view = getCurrentListView();
    if (view.length === 0) return;

    let prevTrack;

    if (state.shuffle && state.shuffledOrder.length > 0) {
        // При shuffle переходим к предыдущему треку в перемешанном порядке
        if (state.shufflePosition > 1) {
            state.shufflePosition--;
            const prevIdx = state.shuffledOrder[state.shufflePosition - 1];
            prevTrack = view[prevIdx];
            console.log('[SHUFFLE] Going back to position', state.shufflePosition - 1, 'index', prevIdx);
        } else {
            return;
        }
    } else {
        // Обычное воспроизведение в обратном порядке
        const currentTrack = state.library[state.currentIndex];
        const currentTrackId = currentTrack?.id || currentTrack?.navidromeId;
        const idxInView = view.findIndex(t => (t.id || t.navidromeId) === currentTrackId);

        if (idxInView > 0) {
            prevTrack = view[idxInView - 1];
        } else if (state.repeat === 'all') {
            prevTrack = view[view.length - 1];
        } else {
            return;
        }
    }

    if (prevTrack.source === 'navidrome') {
        window.playNavidromeSong(prevTrack.navidromeId, prevTrack.title, prevTrack.artist, prevTrack.album, prevTrack.cover);
    } else {
        window.playTrack(prevTrack.id);
    }
};

window.clearQueue = async () => {
    const lang = state.lang;
    const confirmMsg = lang === 'ru' ? 'Вы уверены? Все песни в очереди будут удалены.' : 'Are you sure? All tracks in the queue will be deleted.';
    const successMsg = lang === 'ru' ? 'Очередь очищена' : 'Queue cleared';
    
    if (!confirm(confirmMsg)) return;
    
    const queue = getCurrentListView();
    
    // Если это плейлист - удалить все песни из плейлиста
    if (typeof state.currentTab === 'number') {
        const playlist = state.playlists.find(p => p.id === state.currentTab);
        if (playlist) {
            playlist.songIds = [];
            await db.playlists.update(state.currentTab, { songIds: [] });
        }
    } else {
        // Если это вся библиотека или избранное - удалить все
        for (const track of queue) {
            await db.songs.delete(track.id);
        }
        state.library = [];
        state.currentIndex = -1;
        dom.audio.pause();
        resetUI();
    }
    
    await loadPlaylistsFromDB();
    await loadLibraryFromDB();
    showToast(successMsg);
    renderSidebarQueue();
};

window.togglePlayback = () => {
    if (state.currentIndex === -1 && state.library.length > 0) {
        const firstTrack = state.library[0];
        if (firstTrack.source === 'navidrome') {
            window.playNavidromeSong(firstTrack.navidromeId, firstTrack.title, firstTrack.artist, firstTrack.album, firstTrack.cover);
        } else {
            window.playTrack(firstTrack.id);
        }
    }
    else if (state.currentIndex !== -1) {
        if (dom.audio.paused) dom.audio.play();
        else dom.audio.pause();
    }
};

window.switchTab = (tab) => {
    state.currentTab = tab;
    state.searchQuery = '';  // Clear search when switching tabs
    
    // Сбросить shuffle порядок при переключении табов/плейлистов
    state.shuffledOrder = [];
    state.shufflePosition = 0;
    
    localStorage.setItem('currentTab', JSON.stringify(tab));
    
    // Clear search input
    if (dom.searchInput) {
        dom.searchInput.value = '';
    }
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    if (tab === 'all') {
        document.getElementById('nav-all')?.classList.add('active');
        document.getElementById('nav-all-mobile')?.classList.add('active');
    } else if (tab === 'fav') {
        document.getElementById('nav-fav')?.classList.add('active');
        document.getElementById('nav-fav-mobile')?.classList.add('active');
    } else if (tab === 'navidrome') {
        document.getElementById('nav-navidrome')?.classList.add('active');
        document.getElementById('nav-navidrome-mobile')?.classList.add('active');
    }
    
    console.log('[TAB] Switched to tab:', tab, 'clearing search query and shuffle');
    renderLibrary();
    renderPlaylistNav();
};

window.toggleShuffle = () => {
    state.shuffle = !state.shuffle;
    db.settings.put({key: 'shuffle', value: state.shuffle});
    localStorage.setItem('shuffle', state.shuffle);
    
    // Если shuffle включен, создать перемешанный порядок
    if (state.shuffle) {
        generateShuffleOrder();
        console.log('[SHUFFLE] Shuffle enabled, order generated');
    } else {
        // Если shuffle отключен, очистить порядок
        state.shuffledOrder = [];
        state.shufflePosition = 0;
        console.log('[SHUFFLE] Shuffle disabled');
    }
    
    updateShuffleUI();
};

function updateShuffleUI() {
    if (state.shuffle) dom.shuffleBtn.classList.add('active');
    else dom.shuffleBtn.classList.remove('active');
}

window.toggleRepeat = () => {
    const modes = ['none', 'all', 'one'];
    let idx = modes.indexOf(state.repeat);
    state.repeat = modes[(idx + 1) % modes.length];
    db.settings.put({key: 'repeat', value: state.repeat});
    localStorage.setItem('repeat', state.repeat);
    updateRepeatUI();
};

function updateRepeatUI() {
    const icon = state.repeat === 'one' ? 'repeat-1' : 'repeat';
    dom.repeatBtn.innerHTML = `<i data-lucide="${icon}" size="20"></i>`;
    if (state.repeat !== 'none') dom.repeatBtn.classList.add('active');
    else dom.repeatBtn.classList.remove('active');
    refreshIcons();
}

// ============ ПЛЕЙЛИСТЫ И ТРЕКИ ============
let renameData = { playlistId: null, oldName: null };
let deleteData = { playlistId: null };

// Helper function to add search result (Navidrome) to playlist
window.addSearchResultToPlaylist = (trackId, source) => {
    console.log('[SEARCH RESULT] Adding to playlist:', trackId, source);
    const tempTrackKey = `temp_${source}_${trackId}`;
    const track = window.tempSearchTracks && window.tempSearchTracks[tempTrackKey];
    
    if (source === 'navidrome' && !track) {
        console.error('[SEARCH RESULT] Track not found in temp storage');
        showToast('Error: Track data not available');
        return;
    }
    
    // Store the track in state temporarily so openPlaylistPickerMulti can find it
    window.tempPendingTrack = track;
    window.openPlaylistPickerMulti(trackId, source);
};

// Helper function to toggle favorite for search result
window.toggleFavSearchResult = (trackId, source) => {
    console.log('[SEARCH RESULT] Toggling favorite:', trackId, source);
    const tempTrackKey = `temp_${source}_${trackId}`;
    const track = window.tempSearchTracks && window.tempSearchTracks[tempTrackKey];
    
    if (source === 'navidrome' && !track) {
        console.error('[SEARCH RESULT] Track not found in temp storage');
        showToast('Error: Track data not available');
        return;
    }
    
    if (source === 'navidrome') {
        // For Navidrome songs, save favorite to localStorage
        let navidromeFavs = JSON.parse(localStorage.getItem('navidromeFavorites') || '[]');
        const favIndex = navidromeFavs.findIndex(f => f.navidromeId === trackId);
        
        if (favIndex === -1) {
            navidromeFavs.push({
                navidromeId: trackId,
                title: track.title,
                artist: track.artist,
                album: track.album,
                cover: track.cover,
                source: 'navidrome'
            });
            showToast('Added to favorites!');
        } else {
            navidromeFavs.splice(favIndex, 1);
            showToast('Removed from favorites');
        }
        localStorage.setItem('navidromeFavorites', JSON.stringify(navidromeFavs));
    } else {
        // For local songs, toggle in library
        window.toggleFav(trackId, source);
    }
    
    // Refresh to show updated heart icon
    const results = window.currentSearchResults;
    if (results) {
        renderSearchResults(results);
    }
};

window.openPlaylistPickerMulti = (songId, source = 'local') => {
    state.pendingSongId = songId;
    state.pendingSongSource = source;
    const container = document.getElementById('pickerContainer');
    container.innerHTML = "";

    const listWrap = document.createElement('div');
    listWrap.style.display = 'flex';
    listWrap.style.flexDirection = 'column';
    listWrap.style.gap = '12px';
    listWrap.style.maxHeight = '320px';
    listWrap.style.overflow = 'auto';

    // Получить полную информацию о песне
    // First try to find in library (for local songs)
    let track = state.library.find(t => t.id === songId || t.navidromeId === songId);
    
    // If not found and this is from search results, try temp storage
    if (!track && source === 'navidrome' && window.tempPendingTrack) {
        track = window.tempPendingTrack;
        console.log('[PLAYLIST PICKER] Using temp track from search:', track);
    }

    state.playlists.forEach(pl => {
        const id = pl.id;
        // Для Navidrome песен проверяем по navidromeId
        const isIncluded = Array.isArray(pl.songIds) && (
            pl.songIds.includes(songId) || 
            (track && pl.navidromeSongIds && pl.navidromeSongIds.includes(track.navidromeId))
        );
        
        const btn = document.createElement('button');
        btn.className = 'playlist-picker-btn';
        btn.style.padding = '14px 18px';
        btn.style.background = isIncluded ? 'var(--accent)' : 'var(--surface)';
        btn.style.border = isIncluded ? '2px solid var(--accent)' : '1px solid var(--border)';
        btn.style.borderRadius = '12px';
        btn.style.color = 'white';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = '600';
        btn.style.fontSize = '14px';
        btn.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'space-between';
        btn.style.position = 'relative';
        btn.style.overflow = 'hidden';
        
        btn.innerHTML = `
            <span>${pl.name}</span>
            <i data-lucide="${isIncluded ? 'check' : 'plus'}" style="width: 18px; height: 18px; margin-left: 10px;"></i>
        `;
        
        btn.dataset.playlistId = id;
        btn.dataset.included = isIncluded ? 'true' : 'false';
        
        btn.onmouseover = function() {
            if (this.dataset.included === 'false') {
                this.style.background = 'var(--surface-bright)';
                this.style.borderColor = 'var(--accent)';
                this.style.transform = 'translateX(4px)';
            } else {
                this.style.opacity = '0.9';
            }
        };
        
        btn.onmouseout = function() {
            if (this.dataset.included === 'false') {
                this.style.background = 'var(--surface)';
                this.style.borderColor = 'var(--border)';
                this.style.transform = 'translateX(0)';
            } else {
                this.style.opacity = '1';
            }
        };
        
        btn.onclick = async (e) => {
            e.stopPropagation();
            const playlist = await db.playlists.get(id);
            if (!playlist) return;
            
            playlist.songIds = Array.isArray(playlist.songIds) ? playlist.songIds : [];
            playlist.navidromeSongIds = Array.isArray(playlist.navidromeSongIds) ? playlist.navidromeSongIds : [];
            playlist.navidromeSongs = Array.isArray(playlist.navidromeSongs) ? playlist.navidromeSongs : [];
            
            const isCurrentlyIncluded = playlist.songIds.includes(songId);
            const isNavCurrentlyIncluded = track && track.navidromeId && playlist.navidromeSongIds.includes(track.navidromeId);
            
            if (source === 'navidrome' && track) {
                if (!isNavCurrentlyIncluded) {
                    playlist.navidromeSongIds.push(track.navidromeId);
                    playlist.navidromeSongs.push(track);
                } else {
                    playlist.navidromeSongIds = playlist.navidromeSongIds.filter(s => s !== track.navidromeId);
                    playlist.navidromeSongs = playlist.navidromeSongs.filter(s => s.navidromeId !== track.navidromeId);
                }
            } else {
                if (!isCurrentlyIncluded) {
                    playlist.songIds.push(songId);
                } else {
                    playlist.songIds = playlist.songIds.filter(s => s !== songId);
                }
            }
            
            await db.playlists.update(id, { 
                songIds: playlist.songIds,
                navidromeSongIds: playlist.navidromeSongIds,
                navidromeSongs: playlist.navidromeSongs
            });
            await loadPlaylistsFromDB();
            
            // Если пользователь находится в этом плейлисте, обновить отображение
            if (state.currentTab === id) {
                console.log('[PLAYLIST] Updating library view for playlist:', id);
                renderLibrary();
            }
            
            window.openPlaylistPickerMulti(songId, source);
            refreshIcons();
        };
        
        listWrap.appendChild(btn);
    });

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.justifyContent = 'flex-end';
    controls.style.gap = '12px';
    controls.style.marginTop = '20px';
    controls.style.paddingTop = '15px';
    controls.style.borderTop = '1px solid var(--border)';

    const btnClose = document.createElement('button');
    btnClose.className = 'mini-btn';
    btnClose.innerText = 'Done';
    btnClose.style.background = 'var(--accent)';
    btnClose.style.color = 'white';
    btnClose.style.padding = '10px 20px';
    btnClose.style.borderRadius = '8px';
    btnClose.style.border = 'none';
    btnClose.style.cursor = 'pointer';
    btnClose.style.fontWeight = '600';
    btnClose.style.transition = '0.3s';
    btnClose.onmouseover = () => btnClose.style.opacity = '0.9';
    btnClose.onmouseout = () => btnClose.style.opacity = '1';
    btnClose.onclick = () => window.toggleModal('playlistPickerOverlay');

    controls.appendChild(btnClose);

    container.appendChild(listWrap);
    container.appendChild(controls);
    window.toggleModal('playlistPickerOverlay');
    refreshIcons();
};

window.removeSongFromPlaylist = async (playlistId, songId, source = 'local') => {
    const pl = await db.playlists.get(playlistId);
    if (!pl) return;
    
    if (source === 'navidrome') {
        pl.navidromeSongIds = Array.isArray(pl.navidromeSongIds) ? pl.navidromeSongIds.filter(id => id !== songId) : [];
        pl.navidromeSongs = Array.isArray(pl.navidromeSongs) ? pl.navidromeSongs.filter(s => s.navidromeId !== songId) : [];
    } else {
        pl.songIds = Array.isArray(pl.songIds) ? pl.songIds.filter(id => id !== songId) : [];
    }
    
    await db.playlists.update(playlistId, { 
        songIds: pl.songIds,
        navidromeSongIds: pl.navidromeSongIds,
        navidromeSongs: pl.navidromeSongs
    });
    showToast(I18N[state.lang].removed || 'Removed');
    if (state.currentTab === playlistId) renderLibrary();
    await loadPlaylistsFromDB();
};

    window.toggleTrackSelection = (trackId) => {
        if (state.selectedTracks.has(trackId)) {
            state.selectedTracks.delete(trackId);
        } else {
            state.selectedTracks.add(trackId);
        }
        renderSidebarQueue();
    };

    window.clearTrackSelection = () => {
        state.selectedTracks.clear();
        renderSidebarQueue();
    };

    window.openPlaylistPickerMultiSelect = () => {
        if (state.selectedTracks.size === 0) return;
    
        const container = document.getElementById('pickerContainer');
        container.innerHTML = "";

        const listWrap = document.createElement('div');
        listWrap.style.display = 'flex';
        listWrap.style.flexDirection = 'column';
        listWrap.style.gap = '12px';
        listWrap.style.maxHeight = '320px';
        listWrap.style.overflow = 'auto';

        state.playlists.forEach(pl => {
            const id = pl.id;
            const btn = document.createElement('button');
            btn.className = 'playlist-picker-btn';
            btn.style.padding = '14px 18px';
            btn.style.background = 'var(--surface)';
            btn.style.border = '1px solid var(--border)';
            btn.style.borderRadius = '12px';
            btn.style.color = 'white';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = '600';
            btn.style.fontSize = '14px';
            btn.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'space-between';
        
            btn.innerHTML = `<span>${pl.name}</span><i data-lucide="plus" style="width: 18px; height: 18px; margin-left: 10px;"></i>`;
        
            btn.onmouseover = function() {
                this.style.background = 'var(--surface-bright)';
                this.style.borderColor = 'var(--accent)';
                this.style.transform = 'translateX(4px)';
            };
        
            btn.onmouseout = function() {
                this.style.background = 'var(--surface)';
                this.style.borderColor = 'var(--border)';
                this.style.transform = 'translateX(0)';
            };
        
            btn.onclick = async (e) => {
                e.stopPropagation();
                const playlist = await db.playlists.get(id);
                if (!playlist) return;
            
                playlist.songIds = Array.isArray(playlist.songIds) ? playlist.songIds : [];
            
                for (const trackId of state.selectedTracks) {
                    if (!playlist.songIds.includes(trackId)) {
                        playlist.songIds.push(trackId);
                    }
                }
            
                await db.playlists.update(id, { songIds: playlist.songIds });
                await loadPlaylistsFromDB();
            
                const count = state.selectedTracks.size;
                showToast(`Added ${count} track(s) to ${pl.name}`);
                window.clearTrackSelection();
                window.toggleModal('playlistPickerOverlay');
                refreshIcons();
            };
        
            listWrap.appendChild(btn);
        });

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.justifyContent = 'flex-end';
        controls.style.gap = '12px';
        controls.style.marginTop = '20px';
        controls.style.paddingTop = '15px';
        controls.style.borderTop = '1px solid var(--border)';

        const btnCancel = document.createElement('button');
        btnCancel.className = 'mini-btn';
        btnCancel.innerText = 'Cancel';
        btnCancel.onclick = () => {
            window.toggleModal('playlistPickerOverlay');
            window.clearTrackSelection();
        };

        controls.appendChild(btnCancel);
        container.appendChild(listWrap);
        container.appendChild(controls);
        window.toggleModal('playlistPickerOverlay');
        refreshIcons();
    };

// ============ ИМПОРТ ФАЙЛОВ ============
async function extractMetadata(file) {
    return new Promise((resolve) => {
        jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { title, artist, picture } = tag.tags;
                let coverUrl = null;
                if (picture) {
                    const { data, format } = picture;
                    let base64String = "";
                    for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
                    coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
                }
                resolve({ title: title || file.name.replace(/\.[^/.]+$/, ""), artist: artist || "Unknown Artist", cover: coverUrl });
            },
            onError: () => resolve({ title: file.name.replace(/\.[^/.]+$/, ""), artist: "Unknown Artist", cover: null })
        });
    });
}

document.getElementById('fileInput').onchange = async (e) => {
    if (e.target.files.length === 0) return;
    console.log('[IMPORT] Files selected:', e.target.files.length);
    dom.loader.classList.remove('hidden');
    const currentCount = await db.songs.count();
    console.log('[IMPORT] Current count in DB:', currentCount);
    for(let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        console.log('[IMPORT] Processing file:', file.name);
        const meta = await extractMetadata(file);
        console.log('[IMPORT] Extracted metadata:', meta.title, meta.artist);
        const result = await db.songs.add({ 
            title: meta.title, 
            artist: meta.artist, 
            cover: meta.cover, 
            isFavorite: false, 
            fileBlob: file,
            order: currentCount + i
        });
        console.log('[IMPORT] Added to DB with id:', result);
    }
    console.log('[IMPORT] All files added, loading library...');
    await loadLibraryFromDB();
    console.log('[IMPORT] Library reloaded, state.library.length:', state.library.length);
    console.log('[IMPORT] currentTab:', state.currentTab);
    
    // Ensure UI is updated - force re-render
    console.log('[IMPORT] Force rendering library and sidebar queue...');
    renderLibrary();
    renderSidebarQueue();
    
    // Small delay to ensure DOM updates are rendered
    await new Promise(r => setTimeout(r, 100));
    dom.loader.classList.add('hidden');
    showToast('Files imported successfully!');
    
    // Reset file input so same file can be imported again
    e.target.value = '';
};

// ============ АУДИО УЗЛЫ ============
function setupAudioNodes() {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audioCtx.createMediaElementSource(dom.audio);
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;
    state.bassFilter = state.audioCtx.createBiquadFilter();
    state.bassFilter.type = "lowshelf";
    state.bassFilter.frequency.value = 200; 
    state.bassFilter.gain.value = state.bassEnabled ? state.bassGain : 0;
    source.connect(state.bassFilter);
    state.bassFilter.connect(state.analyser);
    state.analyser.connect(state.audioCtx.destination);
    startVisualizer();
}

function initVisualizer() {
    const c = document.getElementById('visualizerCanvas');
    c.width = window.innerWidth;
    c.height = state.isZen ? window.innerHeight * 0.6 : window.innerHeight * 0.4;
}

function startVisualizer() {
    const c = document.getElementById('visualizerCanvas');
    const ctx = c.getContext('2d');
    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    function draw() {
        requestAnimationFrame(draw);
        state.analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, c.width, c.height);
        const barWidth = (c.width / bufferLength) * 2.5;
        let x = 0;
        for(let i = 0; i < bufferLength; i++) {
            let barHeight = dataArray[i] * (state.isZen ? 1.8 : 1.2);
            ctx.fillStyle = `rgba(255, 62, 0, ${barHeight/255})`;
            ctx.fillRect(x, c.height - barHeight, barWidth, barHeight);
            x += barWidth + 2;
        }
    }
    draw();
}

// ============ СОБЫТИЯ АУДИО ============
function initAudioEvents() {
    dom.audio.onplay = () => { state.isPlaying = true; document.body.classList.add('playing'); updatePlayIcon(true); };
    dom.audio.onpause = () => { state.isPlaying = false; document.body.classList.remove('playing'); updatePlayIcon(false); };
    dom.audio.ontimeupdate = () => {
        const p = (dom.audio.currentTime / dom.audio.duration) * 100 || 0;
        dom.progFill.style.width = p + "%";
        dom.timeCur.innerText = formatTime(dom.audio.currentTime);
    };
    dom.audio.onended = () => window.nextTrack();
    dom.audio.onloadedmetadata = () => dom.timeDur.innerText = formatTime(dom.audio.duration);
}

function updatePlayIcon(playing) {
    if (!dom.playIcon) return;
    const iconName = playing ? 'pause' : 'play';
    dom.playIcon.setAttribute('data-lucide', iconName);
    if (window.lucide) window.lucide.createIcons();
}

function updateVolumeUI() { dom.volFill.style.width = (dom.audio.volume * 100) + "%"; }

// ============ ZEN MODE ============
window.toggleZen = (enable) => {
    state.isZen = enable;
    if (enable) {
        dom.zenOverlay.appendChild(dom.heroSlot);
        dom.zenOverlay.style.display = 'flex';
        dom.visualizer.style.height = '60vh';
        dom.visualizer.style.opacity = '0.6';
        dom.visualizer.style.zIndex = '5005';
        setTimeout(() => dom.zenOverlay.classList.add('active'), 10);
    } else {
        dom.mainContent.appendChild(dom.heroSlot);
        dom.zenOverlay.classList.remove('active');
        dom.visualizer.style.height = '40vh';
        dom.visualizer.style.opacity = '0.4';
        dom.visualizer.style.zIndex = '5';
        setTimeout(() => {
            dom.zenOverlay.style.display = 'none';
        }, 800);
    }
};

// ============ КЛАВИАТУРНЫЕ СОКРАЩЕНИЯ ============
function initKeybinds() {
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        
        if (e.ctrlKey && e.code === 'ArrowRight') {
            e.preventDefault();
            window.nextTrack();
            return;
        }
        if (e.ctrlKey && e.code === 'ArrowLeft') {
            e.preventDefault();
            window.prevTrack();
            return;
        }

        switch(e.code) {
            case 'Space': e.preventDefault(); window.togglePlayback(); break;
            case 'ArrowRight': dom.audio.currentTime += 10; break;
            case 'ArrowLeft': dom.audio.currentTime -= 10; break;
            case 'ArrowUp': e.preventDefault(); dom.audio.volume = Math.min(1, dom.audio.volume + 0.1); updateVolumeUI(); break;
            case 'ArrowDown': e.preventDefault(); dom.audio.volume = Math.max(0, dom.audio.volume - 0.1); updateVolumeUI(); break;
            case 'Escape': if (state.isZen) window.toggleZen(false); break;
            case 'KeyF': window.toggleZen(!state.isZen); break;
        }
    });
}

// ============ ОЧИСТКА БД ============
window.clearFullDatabase = async () => {
    if (!confirm('Вы уверены? Все данные будут удалены.')) return;
    await db.songs.clear();
    await db.playlists.clear();
    await db.settings.clear();
    state.library = [];
    state.playlists = [];
    state.currentIndex = -1;
    state.currentTab = 'all';
    dom.audio.pause();
    resetUI();
    renderLibrary();
    await loadPlaylistsFromDB();
    showToast('Database cleared');
};

// ============ ИНИЦИАЛИЗАЦИЯ ============
export async function initApp() {
    console.log('[APP] Starting initialization...');
    
    // Expose state and dom to window for access from non-module scripts
    window.state = state;
    window.dom = dom;
    
    const setLoaderMsg = (msg) => {
        const lt = document.getElementById('loaderText');
        if (lt) lt.innerText = msg;
        console.log('[Loader]', msg);
    };

    // Fast initialization - show UI immediately
    setLoaderMsg('Loading...');

    // Step 1: Initialize DOM
    try {
        initDOM();
        console.log('[APP] DOM initialized');
    } catch (err) {
        console.error('[APP] DOM init failed:', err);
        setLoaderMsg('Error: DOM initialization failed');
        setTimeout(() => { if(dom.loader) dom.loader.classList.add('hidden'); }, 5000);
        return;
    }

    // Step 2: Check Dexie
    if (typeof Dexie === 'undefined') {
        console.error('[APP] Dexie not loaded');
        setLoaderMsg('Error: Dexie library missing');
        setTimeout(() => { if(dom.loader) dom.loader.classList.add('hidden'); }, 5000);
        return;
    }

    // Step 3: Apply language immediately
    try {
        applyLanguage();
    } catch (err) {
        console.warn('[APP] Language apply failed:', err);
    }

    // Step 4: Init audio events
    try {
        initAudioEvents();
    } catch (err) {
        console.warn('[APP] Audio events failed:', err);
    }

    // Step 5: Init visualizer
    try {
        initVisualizer();
    } catch (err) {
        console.warn('[APP] Visualizer failed:', err);
    }

    // Step 6: Init keybinds
    try {
        initKeybinds();
    } catch (err) {
        console.warn('[APP] Keybinds failed:', err);
    }

    // Setup event listeners
    try {
        if (dom.playBtn) dom.playBtn.onclick = window.togglePlayback;
        
        if (dom.progBar) {
            dom.progBar.onclick = (e) => {
                const p = (e.clientX - dom.progBar.getBoundingClientRect().left) / dom.progBar.offsetWidth;
                if (dom.audio) dom.audio.currentTime = p * dom.audio.duration;
            };
        }
        
        if (dom.volBar) {
            dom.volBar.onclick = (e) => {
                const v = (e.clientX - dom.volBar.getBoundingClientRect().left) / dom.volBar.offsetWidth;
                if (dom.audio) dom.audio.volume = Math.max(0, Math.min(1, v));
                updateVolumeUI();
            };

            const handleVolumePointer = (e) => {
                const rect = dom.volBar.getBoundingClientRect();
                const v = (e.clientX - rect.left) / rect.width;
                if (dom.audio) dom.audio.volume = Math.max(0, Math.min(1, v));
                updateVolumeUI();
            };

            dom.volBar.addEventListener('pointerdown', (e) => {
                try {
                    dom.volBar.setPointerCapture(e.pointerId);
                    handleVolumePointer(e);
                    const onMove = (ev) => handleVolumePointer(ev);
                    const onUp = (ev) => {
                        try { dom.volBar.releasePointerCapture(ev.pointerId); } catch (err) {}
                        dom.volBar.removeEventListener('pointermove', onMove);
                        dom.volBar.removeEventListener('pointerup', onUp);
                    };
                    dom.volBar.addEventListener('pointermove', onMove);
                    dom.volBar.addEventListener('pointerup', onUp);
                } catch (err) {
                    console.warn('[APP] Volume control error:', err);
                }
            });
        }

        if (dom.searchInput) {
            dom.searchInput.addEventListener('input', async (e) => {
                state.searchQuery = e.target.value || '';
                
                // If search is empty, show normal library
                if (!state.searchQuery.trim()) {
                    renderLibrary();
                    return;
                }

                // Perform combined search (local + Navidrome)
                try {
                    const results = await window.performCombinedSearch(state.searchQuery);
                    window.currentSearchResults = results;
                    renderSearchResults(results);
                } catch (err) {
                    console.error('[SEARCH] Error:', err);
                    renderLibrary();
                }
            });
        }

        console.log('[APP] Event listeners attached');
    } catch (err) {
        console.error('[APP] Event listener setup failed:', err);
    }

    // Setup audio context on first click
    document.body.addEventListener('click', () => { 
        if (!state.audioCtx) setupAudioNodes(); 
    }, { once: true });

    // Hide loader immediately
    setTimeout(() => {
        setLoaderMsg('Ready!');
        if (dom.loader) dom.loader.classList.add('hidden');
        console.log('[APP] UI is visible');
    }, 200);

    // ============ BACKGROUND TASKS (non-blocking) ============
    
    // Load settings in background
    setTimeout(async () => {
        try {
            console.log('[APP] Loading settings in background...');
            await loadSettings();
            console.log('[APP] Settings loaded');
        } catch (err) {
            console.warn('[APP] Background settings load failed:', err);
        }
    }, 300);

    // Load library in background
    setTimeout(async () => {
        try {
            console.log('[APP] Loading library in background...');
            await loadLibraryFromDB();
            console.log('[APP] Library loaded');
            updateShuffleUI();
            updateRepeatUI();
        } catch (err) {
            console.warn('[APP] Background library load failed:', err);
            state.library = [];
        }
    }, 400);

    // Load playlists in background
    setTimeout(async () => {
        try {
            console.log('[APP] Loading playlists in background...');
            await loadPlaylistsFromDB();
            console.log('[APP] Playlists loaded');
        } catch (err) {
            console.warn('[APP] Background playlists load failed:', err);
            state.playlists = [];
        }
    }, 500);

    // Initialize auth in background
    setTimeout(() => {
        console.log('[APP] Initializing authentication...');
        try {
            initAuth();
        } catch (err) {
            console.error('[APP] Auth init failed:', err);
        }
    }, 600);
}
