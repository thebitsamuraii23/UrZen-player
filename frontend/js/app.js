// Главная точка входа приложения
import { state, dom, initDOM } from './state.js';
import { initAuth } from './auth.js';
import { searchLocalLibrary } from './navidrome-search.js';
import { loadLibraryFromDB, getCurrentListView, deleteTrack, saveQueueState, restoreQueueState } from './modules/library-manager.js';
import { addSongToPlaylist, removeSongFromPlaylist, createPlaylist, deletePlaylist, renamePlaylist } from './modules/playlist-manager.js';
import { isUserAuthenticated, syncPlaylistsWithServer } from './modules/server-playlist-manager.js';
import { I18N } from './i18n.js?v=20260126-2';
import { formatTime, showToast, refreshIcons } from './helpers.js';
import { loadSettings, applyLanguage, initSettingsHandlers } from './settings.js';

// Инициализация БД
const db = new Dexie("AetherProDB");
db.version(7).stores({
    songs: "++id, title, artist, isFavorite, order",
    playlists: "++id, name",
    settings: "key"
});

// ============ НАСТРОЙКИ ============
// (Теперь в settings.js)

// ============ МОДАЛЬНЫЕ ОКНА ============
window.toggleModal = (id) => { 
    document.getElementById(id).classList.toggle('active'); 
};

window.toggleSettings = () => { window.toggleModal('settingsModal'); };
window.togglePlaylistModal = () => { window.toggleModal('playlistModal'); };
window.closePlaylistPicker = () => { window.toggleModal('playlistPickerOverlay'); };

// INFO PAGE (Settings)
window.toggleSettingsInfo = () => {
    const info = document.getElementById('settingsInfoPage');
    if (!info) return;
    info.style.display = (info.style.display === 'none' || !info.style.display) ? 'block' : 'none';
};

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
    console.log('[PLAYLISTS] Loaded', state.playlists.length, 'playlists');
    state.playlists.forEach((pl, i) => {
        console.log(`  [${i}] "${pl.name}" - songs: ${pl.songIds?.length || 0}, navidromeSongs: ${pl.navidromeSongs?.length || 0}`);
    });
    renderPlaylistNav();
}

function renderPlaylistNav() {
    const containers = [document.getElementById('playlistNav'), document.getElementById('playlistNav-mobile')];
    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = "";
        
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
    await createPlaylist(name);
    
    // Sync with server if authenticated
    if (isUserAuthenticated()) {
        try {
            const { createServerPlaylist } = await import('./modules/server-playlist-manager.js');
            await createServerPlaylist(name);
            console.log('[SYNC] Created playlist on server');
        } catch (error) {
            console.error('[SYNC] Failed to create playlist on server:', error);
        }
    }
    
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
    
    // Get playlist name before deleting (for server sync)
    const playlist = state.playlists.find(p => p.id === id);
    
    await db.playlists.delete(id);
    
    // Sync with server if authenticated
    if (isUserAuthenticated() && playlist) {
        try {
            const { deleteServerPlaylist } = await import('./modules/server-playlist-manager.js');
            await deleteServerPlaylist(id);
            console.log('[SYNC] Deleted playlist on server');
        } catch (error) {
            console.error('[SYNC] Failed to delete playlist on server:', error);
        }
    }
    
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
    
    // Sync with server if authenticated
    if (isUserAuthenticated()) {
        try {
            const { renameServerPlaylist } = await import('./modules/server-playlist-manager.js');
            await renameServerPlaylist(id, newName);
            console.log('[SYNC] Renamed playlist on server');
        } catch (error) {
            console.error('[SYNC] Failed to rename playlist on server:', error);
        }
    }
    
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
// loadLibraryFromDB is imported from library-manager module
// getCurrentListView is imported from library-manager module

function renderLibrary() {
    dom.playlist.innerHTML = "";
    let list = getCurrentListView();
    
    // Default list layout for local songs and playlists
    dom.playlist.style.display = 'flex';
    dom.playlist.style.gridTemplateColumns = '';
    dom.playlist.style.flexDirection = 'column';
    dom.playlist.style.padding = '0';
    dom.playlist.style.gap = '0';
    
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
                <div class="queue-buttons">
                    <button class="queue-btn play-next" onclick="event.stopPropagation(); window.addToQueueAndPlayNext('${trackId}', '${source}', true)">
                        <i data-lucide="skip-forward"></i>
                        <span class="btn-label">Play next</span>
                    </button>
                    <button class="queue-btn add-queue" onclick="event.stopPropagation(); window.addToQueueAndPlayNext('${trackId}', '${source}', false)">
                        <i data-lucide="list-plus"></i>
                        <span class="btn-label">Add to queue</span>
                    </button>
                </div>
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
    })
    
    refreshIcons();
    renderSidebarQueue();
}

// Инициализация контейнера Navidrome (один раз)
function initNavidromeContainer() {
    // Проверяем, уже ли создан контейнер
    let navidromeContainer = document.getElementById('navidromeContainer');
    if (navidromeContainer) {
        // Контейнер уже есть, просто обновим сетку
        updateNavidromeSongs();
        return;
    }
    
    // Создаём контейнер ОДИН раз
    navidromeContainer = document.createElement('div');
    navidromeContainer.id = 'navidromeContainer';
    document.body.appendChild(navidromeContainer);
    
    navidromeContainer.style.cssText = `
        display: none;
        flex-direction: column;
        height: 100vh;
        width: 100%;
        background: var(--bg);
        position: fixed;
        top: 0;
        left: 0;
        z-index: 1000;
    `;
    
    // Верхняя панель с поиском и кнопкой назад (создаём один раз)
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 20px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        display: flex;
        gap: 15px;
        align-items: center;
        flex-shrink: 0;
    `;
    
    const backBtn = document.createElement('button');
    backBtn.innerText = '← Back';
    backBtn.style.cssText = 'background: var(--accent); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600;';
    backBtn.onclick = () => window.switchTab('all');
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'navidromeSearchInput';
    searchInput.placeholder = 'Search Navidrome...';
    searchInput.value = state.searchQuery || '';
    searchInput.style.cssText = 'flex: 1; background: var(--surface-bright); border: 1px solid var(--border); padding: 10px 15px; border-radius: 8px; color: white; font-size: 14px;';
    
    // Слушатель НА ОДНОМ input элементе
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        updateNavidromeSongs();
    });
    
    header.appendChild(backBtn);
    header.appendChild(searchInput);
    navidromeContainer.appendChild(header);
    
    // Контейнер для сетки (создаём один раз, будем обновлять содержимое)
    const grid = document.createElement('div');
    grid.id = 'navidromeGrid';
    grid.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 30px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 25px;
        width: 100%;
        box-sizing: border-box;
        align-content: start;
    `;
    navidromeContainer.appendChild(grid);
    
    // Теперь заполняем сетку песнями
    updateNavidromeSongs();
}

// Обновление сетки песен (вызывается при поиске)
function updateNavidromeSongs() {
    const grid = document.getElementById('navidromeGrid');
    if (!grid) return;
    
    grid.innerHTML = ''; // Очищаем только сетку
    
    // If search query is empty, show all loaded songs
    if (!state.searchQuery || state.searchQuery.trim().length === 0) {
        let list = state.navidromeSongs || [];
        // If list is empty, try to reload from API/cache
        if (list.length === 0 && typeof window.getAllNavidromeSongs === 'function') {
            grid.innerHTML = '';
            const loadingMsg = document.createElement('div');
            loadingMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
            loadingMsg.innerHTML = `<p>🌐 Loading Navidrome songs...</p>`;
            grid.appendChild(loadingMsg);
            window.getAllNavidromeSongs().then((songs) => {
                state.navidromeSongs = songs;
                grid.innerHTML = '';
                if (songs.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
                    emptyMsg.innerHTML = `<p>🌐 No songs found</p>`;
                    grid.appendChild(emptyMsg);
                } else {
                    renderNavidromeTiles(songs, grid);
                }
            }).catch(() => {
                grid.innerHTML = '';
                const errorMsg = document.createElement('div');
                errorMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
                errorMsg.innerHTML = `<p>⚠️ Failed to load Navidrome songs</p>`;
                grid.appendChild(errorMsg);
            });
            return;
        }
        if (list.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
            emptyMsg.innerHTML = `<p>🌐 No songs found</p>`;
            grid.appendChild(emptyMsg);
            return;
        }
        renderNavidromeTiles(list, grid);
        return;
    }
    
    // If there's a search query, use API search
    const searchMsg = document.createElement('div');
    searchMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
    searchMsg.innerHTML = `<p>🔍 Searching...</p>`;
    grid.appendChild(searchMsg);
    
    // Use the searchNavidrome function from navidrome-search.js
    if (window.searchNavidrome) {
        window.searchNavidrome(state.searchQuery).then((results) => {
            grid.innerHTML = ''; // Clear loading message
            
            if (results.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
                emptyMsg.innerHTML = `<p>🌐 No songs found</p>`;
                grid.appendChild(emptyMsg);
                return;
            }
            
            renderNavidromeTiles(results, grid);
        }).catch(err => {
            console.error('[NAV] Search error:', err);
            grid.innerHTML = '';
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
            errorMsg.innerHTML = `<p>⚠️ Search error</p>`;
            grid.appendChild(errorMsg);
        });
    }
}

// Функция для отрисовки плиток песен
function renderNavidromeTiles(list, grid) {
    list.forEach((track) => {
        const currentTrack = state.currentIndex !== -1 ? state.library[state.currentIndex] : null;
        const isActive = currentTrack && (currentTrack.id === track.id || currentTrack.navidromeId === track.navidromeId);
        
        const tile = document.createElement('div');
        tile.className = `navidrome-song-tile ${isActive ? 'active' : ''}`;
        tile.style.cssText = `
            cursor: pointer;
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            background: var(--surface);
            transition: all 0.2s ease;
            border: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            height: 220px;
        `;
        
        // Контейнер для обложки
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = `
            position: relative;
            width: 100%;
            flex-grow: 1;
            overflow: hidden;
            background: var(--surface-bright);
        `;
        
        const img = document.createElement('img');
        img.src = track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300';
        img.onerror = () => { img.src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300'; };
        img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease;
        `;
        imgContainer.appendChild(img);
        
        // Overlay для артиста (появляется при наведении)
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 10;
        `;
        overlay.innerHTML = `
            <div style="color: white; text-align: center; padding: 20px; animation: fadeInScale 0.3s ease;">
                <p style="margin: 0; font-size: 13px; color: var(--text-dim); margin-bottom: 8px;">Artist</p>
                <p style="margin: 0; font-size: 14px; font-weight: 600; word-break: break-word;">${track.artist}</p>
            </div>
        `;
        imgContainer.appendChild(overlay);
        
        // Текстовая информация
        const info = document.createElement('div');
        info.style.cssText = `
            padding: 12px;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            min-height: 70px;
        `;
        info.innerHTML = `
            <h4 style="margin: 0; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.3;">
                ${track.title}
            </h4>
        `;
        
        tile.appendChild(imgContainer);
        tile.appendChild(info);
        
        const trackId = track.id || track.navidromeId;
        const safeTitle = (track.title || '').replace(/'/g, "\\'");
        const safeArtist = (track.artist || '').replace(/'/g, "\\'");
        const safeAlbum = (track.album || '').replace(/'/g, "\\'");
        const safeCover = (track.cover || '').replace(/'/g, "\\'");
        
        tile.onclick = () => {
            // Animate tile and open player
            tile.style.animation = 'scaleToPlayer 0.6s ease-in-out forwards';
            
            setTimeout(() => {
                window.playNavidromeSong(trackId, safeTitle, safeArtist, safeAlbum, safeCover);
            }, 300);
        };
        
        // Эффекты при наведении
        tile.addEventListener('mouseenter', () => {
            tile.style.transform = 'scale(1.08) translateY(-5px)';
            tile.style.boxShadow = '0 12px 24px rgba(0,0,0,0.4)';
            overlay.style.opacity = '1';
            img.style.transform = 'scale(1.1)';
        });
        
        tile.addEventListener('mouseleave', () => {
            tile.style.transform = 'scale(1)';
            tile.style.boxShadow = 'none';
            overlay.style.opacity = '0';
            img.style.transform = 'scale(1)';
        });
        
        grid.appendChild(tile);
    });
}

function renderNavidromeInterface() {
    initNavidromeContainer();
    // Always refresh Navidrome grid when entering the tab
    setTimeout(() => {
        if (typeof updateNavidromeSongs === 'function') updateNavidromeSongs();
    }, 0);
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

// deleteTrack moved to library-manager.js module
window.deleteTrack = async (id, source = 'local') => {
    await deleteTrack(id, source);
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

        queue.forEach((track, idx) => {
            const currentTrack = state.currentIndex !== -1 ? state.library[state.currentIndex] : null;
            const isActive = currentTrack && (currentTrack.id === track.id || currentTrack.navidromeId === track.navidromeId);
            const trackId = track.id || track.navidromeId;
            const source = track.source || 'local';
            
            const div = document.createElement('div');
            div.className = `song-item${isActive ? ' active' : ''}`;
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '8px';
            div.style.cursor = 'pointer';
            div.style.position = 'relative';
            
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
            
            // Create img element
            const img = document.createElement('img');
            img.src = track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100';
            img.style.width = '40px';
            img.style.height = '40px';
            img.style.borderRadius = '4px';
            img.onerror = () => { img.src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'; };
            
            // Create info div
            const info = document.createElement('div');
            info.className = 'song-item-info';
            info.style.flex = '1';
            info.innerHTML = `<h4>${track.title}${source === 'navidrome' ? ' 🌐' : ''}</h4><p>${track.artist}</p>`;
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'mini-btn danger';
            deleteBtn.title = 'Remove from queue';
            deleteBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; padding: 6px; color: var(--text-dim); transition: 0.2s;';
            deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width:18px; height:18px;"></i>';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                console.log('[QUEUE] Removing track at index:', idx);
                window.removeFromQueue(trackId);
            };
            deleteBtn.onmouseover = () => deleteBtn.style.color = '#ff3e00';
            deleteBtn.onmouseout = () => deleteBtn.style.color = 'var(--text-dim)';
            
            // Assemble div
            div.appendChild(img);
            div.appendChild(info);
            div.appendChild(deleteBtn);
            
            // Add click handler for playing the track
            div.addEventListener('click', (e) => {
                // Don't trigger if clicking the delete button
                if (e.target.closest('.mini-btn')) return;
                e.stopPropagation();
                if (e.ctrlKey || e.metaKey) {
                    window.toggleTrackSelection(trackId);
                    renderSidebarQueue();
                    refreshIcons();
                } else {
                    eval(onClickHandler);
                }
            });
            
            container.appendChild(div);
        });
        refreshIcons();
    });
}

// Remove a track from the queue by ID
window.removeFromQueue = (trackId) => {
    console.log('[QUEUE] Removing track:', trackId);
    // Find and remove from state.library
    const idx = state.library.findIndex(t => t.id === trackId || t.navidromeId === trackId);
    if (idx !== -1) {
        console.log('[QUEUE] Found at index:', idx);
        state.library.splice(idx, 1);
        // If currentIndex is after removed, decrement
        if (state.currentIndex > idx) state.currentIndex--;
        // If currentIndex is now out of bounds, reset
        if (state.currentIndex >= state.library.length) state.currentIndex = -1;
        // Save and update
        if (typeof saveQueueState === 'function') {
            console.log('[QUEUE] Saving queue state');
            saveQueueState();
        }
        renderSidebarQueue();
        renderLibrary();
    } else {
        console.warn('[QUEUE] Track not found:', trackId);
    }
};

// ============ ПЛЕЕР ============
window.playTrack = (id) => {
    console.log('🎵 [PLAYTRACK] Called with id:', id);
    const track = state.library.find(t => t.id === id || t.navidromeId === id);
    console.log('🎵 [PLAYTRACK] Found track:', track?.title, track?.artist);
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
    
    // Для Navidrome песен: ВСЕГДА генерируем свежий URL, так как токены истекают
    let audioSrc = track.url;
    if (track.source === 'navidrome' && track.navidromeId) {
        console.log('[PLAYBACK] Regenerating stream URL for Navidrome track ID:', track.navidromeId);
        if (window.getNavidromeStreamUrl) {
            audioSrc = window.getNavidromeStreamUrl(track.navidromeId);
            console.log('[PLAYBACK] Generated fresh URL:', audioSrc);
        } else {
            console.error('[PLAYBACK] getNavidromeStreamUrl function not available');
            return;
        }
    }
    
    if (!audioSrc) {
        console.error('[PLAYBACK] No audio source available for track:', track);
        return;
    }
    
    console.log('[PLAYBACK] Playing:', track.title, 'from', track.source, 'navidromeId:', track.navidromeId);
    dom.audio.src = audioSrc;
    dom.audio.crossOrigin = 'anonymous';
    dom.audio.play().catch(err => {
        console.error('[PLAYBACK] Play error:', err);
        showToast('Ошибка воспроизведения: ' + err.message);
    });
    dom.trackName.innerText = track.title;
    dom.artistName.innerText = track.artist;
    if (track.cover) {
        dom.mainCover.src = track.cover;
        dom.vinylContainer.classList.add('visible');
    } else {
        dom.vinylContainer.classList.remove('visible');
    }
    
    // Update browser title and Media Session API
    document.title = `${track.title} - ${track.artist} | UrZen`;
    if ('mediaSession' in navigator) {
        try {
            const metadata = {
                title: String(track.title || 'Unknown Title'),
                artist: String(track.artist || 'Unknown Artist'),
                album: String(track.album || 'UrZen Player')
            };
            
            if (track.cover) {
                const coverUrl = track.cover;
                metadata.artwork = [
                    { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
                    { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
                    { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
                    { src: coverUrl, sizes: '256x256', type: 'image/jpeg' }
                ];
                console.log('[MEDIA SESSION] Artwork set with cover');
            }
            
            navigator.mediaSession.metadata = new MediaMetadata(metadata);
            console.log('[MEDIA SESSION] Metadata set:', metadata);
            
            // Update playback state
            navigator.mediaSession.playbackState = 'playing';
            
            // Set position state for progress bar
            navigator.mediaSession.setPositionState({
                duration: dom.audio.duration || 0,
                playbackRate: 1.0,
                position: 0
            });
            
            // Set up action handlers
            navigator.mediaSession.setActionHandler('play', () => {
                dom.audio.play().catch(e => console.error('Play action error:', e));
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                dom.audio.pause();
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                window.nextTrack();
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                window.prevTrack();
            });
        } catch (e) {
            console.error('[MEDIA SESSION] Error:', e);
        }
    }
    
    // Сохраняем состояние очереди
    if (window.saveQueueState) window.saveQueueState();
    
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
    window.toggleModal('clearQueueModal');
};

window.confirmClearQueue = async () => {
    const lang = state.lang;
    const successMsg = lang === 'ru' ? 'Очередь очищена' : 'Queue cleared';
    
    window.toggleModal('clearQueueModal');
    
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

window.addToQueueAndPlayNext = (id, source, playNext) => {
    const track = state.library.find(t => 
        source === 'navidrome' 
            ? t.navidromeId === id 
            : String(t.id) === String(id)
    );
    
    if (!track) return;
    
    if (playNext) {
        // Insert after current track and play
        const insertIndex = state.currentIndex >= 0 ? state.currentIndex + 1 : 0;
        state.library.splice(insertIndex, 0, track);
        state.currentIndex = insertIndex;
        
        if (track.source === 'navidrome') {
            window.playNavidromeSong(track.navidromeId, track.title, track.artist, track.album, track.cover);
        } else {
            window.playTrack(track.id);
        }
        
        showToast('▶ Playing next');
    } else {
        // Add to end of queue
        showToast('✓ Added to queue');
    }
    
    renderLibrary();
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
    // Check for Music tab access restriction BEFORE setting the tab
    if (tab === 'navidrome') {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.log('[TAB] User not authenticated, showing restriction overlay');
            window.showMusicRestrictionOverlay();
            // Don't change tab
            return;
        }
    }
    
    state.currentTab = tab;
    state.searchQuery = '';  // Clear search when switching tabs
    state.navidromeSearchQuery = '';  // Clear Navidrome search

    // Hide left About close button when switching away from About
    try {
        const aboutCloseBtn = document.getElementById('aboutCloseBtn');
        if (tab !== 'about' && aboutCloseBtn) aboutCloseBtn.style.display = 'none';
    } catch (e) {}
    
    // Сбросить shuffle порядок при переключении табов/плейлистов
    state.shuffledOrder = [];
    state.shufflePosition = 0;
    
    localStorage.setItem('currentTab', JSON.stringify(tab));
    
    // Update search input placeholder
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.value = '';
        // Use "Search Music..." only in zen mode, otherwise "Search library..."
        searchInput.placeholder = state.isZen ? 'Search Music...' : 'Search library...';
    }
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Обработка переключения вкладок
    if (tab === 'all') {
        document.getElementById('nav-all')?.classList.add('active');
        document.getElementById('nav-all-mobile')?.classList.add('active');
        console.log('[TAB] Switched to All Library');
        
        // Скрываем Navidrome и About, показываем остальное
        const navidromeContainer = document.getElementById('navidromeContainer');
        const aboutContainer = document.getElementById('aboutContainer');
        const mainContent = document.getElementById('mainContent');
        const rightPanel = document.querySelector('.right');
        const playerControls = document.getElementById('playerControls');
        const topSearch = document.getElementById('topSearch');
        if (navidromeContainer) navidromeContainer.style.display = 'none';
        if (aboutContainer) aboutContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'flex';
        if (rightPanel) rightPanel.style.display = 'flex';
        if (playerControls) playerControls.style.display = 'flex';
        if (topSearch) topSearch.style.display = 'flex';
        
        renderLibrary();
        renderPlaylistNav();
    } else if (tab === 'fav') {
        document.getElementById('nav-fav')?.classList.add('active');
        document.getElementById('nav-fav-mobile')?.classList.add('active');
        console.log('[TAB] Switched to Favorites');
        
        // Скрываем Navidrome и About, показываем остальное
        const navidromeContainer = document.getElementById('navidromeContainer');
        const aboutContainer = document.getElementById('aboutContainer');
        const mainContent = document.getElementById('mainContent');
        const rightPanel = document.querySelector('.right');
        const playerControls = document.getElementById('playerControls');
        const topSearch = document.getElementById('topSearch');
        if (navidromeContainer) navidromeContainer.style.display = 'none';
        if (aboutContainer) aboutContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'flex';
        if (rightPanel) rightPanel.style.display = 'flex';
        if (playerControls) playerControls.style.display = 'flex';
        if (topSearch) topSearch.style.display = 'flex';
        
        renderLibrary();
        renderPlaylistNav();
    } else if (tab === 'navidrome') {
        document.getElementById('nav-navidrome')?.classList.add('active');
        document.getElementById('nav-navidrome-mobile')?.classList.add('active');
        
        // ПЕРВЫЙ показываем контейнер
        const navidromeContainer = document.getElementById('navidromeContainer');
        const aboutContainer = document.getElementById('aboutContainer');
        const mainContent = document.getElementById('mainContent');
        const rightPanel = document.querySelector('.right');
        const playerControls = document.getElementById('playerControls');
        const topSearch = document.getElementById('topSearch');
        if (navidromeContainer) navidromeContainer.style.display = 'flex';
        if (aboutContainer) aboutContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';
        if (rightPanel) rightPanel.style.display = 'none';
        if (playerControls) playerControls.style.display = 'none';
        if (topSearch) topSearch.style.display = 'none';
        
        // Проверяем, загружены ли песни
        if (!state.navidromeSongs || state.navidromeSongs.length === 0) {
            console.log('[TAB] Navidrome songs not loaded, loading now...');
            if (window.getAllNavidromeSongs) {
                window.getAllNavidromeSongs().then((songs) => {
                    console.log('[TAB] Navidrome songs loaded:', songs.length);
                    state.navidromeSongs = songs;
                    renderNavidromeInterface();
                }).catch(err => {
                    console.error('[TAB] Error loading Navidrome:', err);
                    renderNavidromeInterface();
                });
                return;
            }
        }
        // Always refresh Navidrome grid when entering the tab
        renderNavidromeInterface();
    } else if (tab === 'about') {
        document.getElementById('nav-about')?.classList.add('active');
        document.getElementById('nav-about-mobile')?.classList.add('active');
        console.log('[TAB] Switched to About');
        
        // Показываем about контейнер, скрываем остальное
        const aboutContainer = document.getElementById('aboutContainer');
        const navidromeContainer = document.getElementById('navidromeContainer');
        const mainContent = document.getElementById('mainContent');
        const rightPanel = document.querySelector('.right');
        const playerControls = document.getElementById('playerControls');
        const topSearch = document.getElementById('topSearch');
        
        if (aboutContainer) aboutContainer.style.display = 'flex';
        // Ensure left-side close button exists and is visible only for About
        try {
            let btn = document.getElementById('aboutCloseBtn');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'aboutCloseBtn';
                btn.className = 'about-close';
                btn.innerHTML = '✕';
                btn.style.cssText = 'position: fixed; left: 18px; top: 18px; z-index: 1101; width: 40px; height: 40px; padding: 0; border-radius: 8px; background: rgba(255, 107, 145, 0.1); color: #ff6f91; border: 1px solid rgba(255, 107, 145, 0.3); cursor: pointer; font-size: 24px; font-weight: bold; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; line-height: 1; margin: 0;';
                btn.onmouseover = function() { this.style.background = 'rgba(255, 107, 145, 0.2)'; this.style.borderColor = 'rgba(255, 107, 145, 0.5)'; this.style.transform = 'scale(1.1) rotate(90deg)'; };
                btn.onmouseout = function() { this.style.background = 'rgba(255, 107, 145, 0.1)'; this.style.borderColor = 'rgba(255, 107, 145, 0.3)'; this.style.transform = 'scale(1) rotate(0deg)'; };
                btn.onclick = () => { window.switchTab('all'); };
                document.body.appendChild(btn);
            }
            btn.style.display = 'block';
        } catch (e) {}
        if (navidromeContainer) navidromeContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';
        if (rightPanel) rightPanel.style.display = 'none';
        if (playerControls) playerControls.style.display = 'none';
        if (topSearch) topSearch.style.display = 'none';
        
        // Локализуем страницу
        if (window.localizePageContent) {
            window.localizePageContent();
        }
    } else {
        // Playlist tab
        console.log('[TAB] Switched to playlist:', tab);
        
        // Скрываем Navidrome, показываем остальное
        const navidromeContainer = document.getElementById('navidromeContainer');
        const mainContent = document.getElementById('mainContent');
        const rightPanel = document.querySelector('.right');
        const playerControls = document.getElementById('playerControls');
        const topSearch = document.getElementById('topSearch');
        if (navidromeContainer) navidromeContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'flex';
        if (rightPanel) rightPanel.style.display = 'flex';
        if (playerControls) playerControls.style.display = 'flex';
        if (topSearch) topSearch.style.display = 'flex';
        
        renderLibrary();
        renderPlaylistNav();
    }
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
    console.log('[PLAYLIST PICKER] Opened for songId:', songId, 'type:', typeof songId, 'source:', source);
    
    // Normalize songId type for local items: prefer Number when possible
    if (source !== 'navidrome') {
        const n = Number(songId);
        if (!Number.isNaN(n)) songId = n;
    }
    
    console.log('[PLAYLIST PICKER] After normalization - songId:', songId, 'type:', typeof songId);
    
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
            console.log('[PLAYLIST PICKER] Button clicked for playlist:', id, 'songId:', songId, 'source:', source);
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
                    // Сохраняем полный объект песни для надёжности
                    playlist.navidromeSongs.push({
                        navidromeId: track.navidromeId,
                        title: track.title,
                        artist: track.artist,
                        album: track.album,
                        cover: track.cover,
                        source: 'navidrome'
                    });
                    
                    // Sync with server if authenticated
                    if (isUserAuthenticated()) {
                        try {
                            const { addTrackToServerPlaylist } = await import('./modules/server-playlist-manager.js');
                            const trackData = {
                                track_title: track.title,
                                track_artist: track.artist,
                                track_album: track.album,
                                track_duration: track.duration,
                                track_source: 'navidrome',
                                navidrome_id: track.navidromeId,
                                cover_art_id: track.coverArtId || track.cover
                            };
                            await addTrackToServerPlaylist(id, trackData);
                            console.log('[SYNC] Added track to server playlist');
                        } catch (error) {
                            console.error('[SYNC] Failed to add track to server playlist:', error);
                        }
                    }
                } else {
                    playlist.navidromeSongIds = playlist.navidromeSongIds.filter(s => s !== track.navidromeId);
                    playlist.navidromeSongs = playlist.navidromeSongs.filter(s => s.navidromeId !== track.navidromeId);
                }
            } else {
                if (!isCurrentlyIncluded) {
                    playlist.songIds.push(songId);
                    
                    // Sync with server if authenticated
                    if (isUserAuthenticated()) {
                        try {
                            const { addTrackToServerPlaylist } = await import('./modules/server-playlist-manager.js');
                            // Get track details from library
                            const trackData = {
                                track_title: track?.title || 'Unknown',
                                track_artist: track?.artist || 'Unknown',
                                track_album: track?.album || 'Unknown',
                                track_duration: track?.duration || 0,
                                track_source: 'local',
                                navidrome_id: null,
                                cover_art_id: track?.cover || null
                            };
                            await addTrackToServerPlaylist(id, trackData);
                            console.log('[SYNC] Added local track to server playlist');
                        } catch (error) {
                            console.error('[SYNC] Failed to add track to server playlist:', error);
                        }
                    }
                } else {
                    playlist.songIds = playlist.songIds.filter(s => s !== songId);
                }
            }
            
            await db.playlists.update(id, { 
                songIds: playlist.songIds,
                navidromeSongIds: playlist.navidromeSongIds,
                navidromeSongs: playlist.navidromeSongs
            });
            console.log('[PLAYLIST] Updated playlist', id, 'songIds:', playlist.songIds, 'navidromeSongIds:', playlist.navidromeSongIds);
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
    await removeSongFromPlaylist(playlistId, songId, source);
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
            source: 'local',  // ← Добавляем явно!
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
    dom.audio.onplay = () => { 
        state.isPlaying = true; 
        document.body.classList.add('playing'); 
        updatePlayIcon(true);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
    };
    dom.audio.onpause = () => { 
        state.isPlaying = false; 
        document.body.classList.remove('playing'); 
        updatePlayIcon(false);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
    };
    dom.audio.ontimeupdate = () => {
        const p = (dom.audio.currentTime / dom.audio.duration) * 100 || 0;
        dom.progFill.style.width = p + "%";
        dom.timeCur.innerText = formatTime(dom.audio.currentTime);
        // Update media session position state
        if ('mediaSession' in navigator && dom.audio.duration) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: dom.audio.duration,
                    playbackRate: 1.0,
                    position: dom.audio.currentTime
                });
            } catch (e) {
                // Ignore errors from setPositionState
            }
        }
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
        
        // Setup zen search with global search input
        const globalSearch = document.getElementById('globalSearch');
        const zenSearchResults = document.getElementById('zenSearchResults');
        
        if (globalSearch) {
            globalSearch.placeholder = 'Search Music...';
            globalSearch.value = '';
            globalSearch.focus();
            
            // Remove existing listeners and add new zen search listener
            const newGlobalSearch = globalSearch.cloneNode(true);
            globalSearch.parentNode.replaceChild(newGlobalSearch, globalSearch);
            
            newGlobalSearch.addEventListener('input', async (e) => {
                const query = e.target.value.trim();
                
                if (!query) {
                    zenSearchResults.innerHTML = '';
                    return;
                }
                
                // Perform combined search
                try {
                    const results = await window.performCombinedSearch(query);
                    renderZenSearchResults(results.slice(0, 7), zenSearchResults);
                } catch (err) {
                    console.error('[ZEN SEARCH] Error:', err);
                    zenSearchResults.innerHTML = '<div class="zen-search-empty">Error searching</div>';
                }
            });
        }
    } else {
        dom.mainContent.appendChild(dom.heroSlot);
        dom.zenOverlay.classList.remove('active');
        dom.visualizer.style.height = '40vh';
        dom.visualizer.style.opacity = '0.4';
        dom.visualizer.style.zIndex = '5';
        
        // Ensure hero-section has correct CSS class to apply styles
        if (dom.heroSlot) {
            dom.heroSlot.className = 'hero-section';
        }
        
        setTimeout(() => {
            dom.zenOverlay.style.display = 'none';
        }, 800);
        
        // Restore global search input
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.placeholder = 'Search library...';
            globalSearch.value = '';
            
            // Reset to normal search listener
            const newGlobalSearch = globalSearch.cloneNode(true);
            globalSearch.parentNode.replaceChild(newGlobalSearch, globalSearch);
            
            newGlobalSearch.addEventListener('input', async (e) => {
                state.searchQuery = e.target.value || '';
                
                if (!state.searchQuery.trim()) {
                    renderLibrary();
                    return;
                }

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
        
        // Clear zen search results
        const zenSearchResults = document.getElementById('zenSearchResults');
        if (zenSearchResults) zenSearchResults.innerHTML = '';
    }
};

// Render zen mode search results (7 items in inline format)
function renderZenSearchResults(results, container) {
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="zen-search-empty">No results found</div>';
        return;
    }
    
    container.innerHTML = results.map(track => {
        const trackId = track.id || track.navidromeId;
        const source = track.source || 'local';
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
        
        return `
            <div class="zen-search-result-item" onclick="${onClickHandler}; window.toggleZen(false);">
                <img 
                    src="${track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'}" 
                    class="zen-result-thumbnail"
                    onerror="this.src='https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'"
                >
                <div class="zen-result-title">${track.title || 'Unknown'}</div>
                <div class="zen-result-artist">${track.artist || 'Unknown Artist'}</div>
            </div>
        `;
    }).join('');
}

// ============ КЛАВИАТУРНЫЕ СОКРАЩЕНИЯ ============
function initKeybinds() {
    window.addEventListener('keydown', (e) => {
        // Разрешить ESC в zen search input
        const isZenSearchInput = e.target.id === 'zenSearchInput';
        
        // Не обрабатывать клавиши когда в инпуте/текстареа/селекте (кроме zen search)
        if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') && !isZenSearchInput) return;
        
        // Не обрабатывать F когда в Navidrome контейнере
        if (e.code === 'KeyF' && document.getElementById('navidromeContainer')?.style.display !== 'none') return;
        
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
            case 'Escape':
                if (state.isZen) {
                    window.toggleZen(false);
                } else if (state.currentTab === 'about') {
                    window.switchTab('all');
                }
                break;
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
    window.db = db;  // ← Экспортируем БД в глобальный scope
    
    // Restore Navidrome songs from localStorage cache if available
    try {
        const cached = localStorage.getItem('navidromeSongs');
        if (cached) {
            const cachedSongs = JSON.parse(cached);
            window._navidromeSongsCache = cachedSongs;
            window.state.navidromeSongs = cachedSongs;
            console.log('[APP] Restored Navidrome songs from cache:', cachedSongs.length);
        }
    } catch (err) {
        console.warn('[APP] Failed to restore Navidrome cache:', err);
    }
    
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
    
    // Initialize settings handlers first
    initSettingsHandlers();
    

    // Sequentially load settings, library, and playlists, then set initial tab
    (async () => {
        try {
            console.log('[APP] Loading settings...');
            await loadSettings();
            console.log('[APP] Settings loaded');
        } catch (err) {
            console.warn('[APP] Settings load failed:', err);
        }
        try {
            console.log('[APP] Loading library...');
            await loadLibraryFromDB();
            console.log('[APP] Library loaded');
            await restoreQueueState();
            updateShuffleUI();
            updateRepeatUI();
        } catch (err) {
            console.warn('[APP] Library load failed:', err);
            state.library = [];
        }
        try {
            console.log('[APP] Loading playlists...');
            await loadPlaylistsFromDB();
            console.log('[APP] Playlists loaded');
        } catch (err) {
            console.warn('[APP] Playlists load failed:', err);
            state.playlists = [];
        }
        // Ensure currentTab is set and switchTab is called
        if (!state.currentTab) {
            state.currentTab = 'all';
            localStorage.setItem('currentTab', JSON.stringify('all'));
        }
        window.switchTab(state.currentTab);
    })();

    // Initialize auth in background
    setTimeout(() => {
        console.log('[APP] Initializing authentication...');
        try {
            initAuth();
        } catch (err) {
            console.error('[APP] Auth init failed:', err);
        }
    }, 600);

    // Load Navidrome songs in background
    setTimeout(async () => {
        try {
            console.log('[APP] Loading Navidrome songs in background...');
            if (window.getAllNavidromeSongs) {
                const songs = await window.getAllNavidromeSongs();
                state.navidromeSongs = songs;
                console.log('[APP] Navidrome songs loaded:', songs.length);
            }
        } catch (err) {
            console.warn('[APP] Navidrome load failed:', err);
            state.navidromeSongs = [];
        }
    }, 700);
}

// ============ МОБИЛЬНЫЙ ПЛЕЕР - SPOTIFY-LIKE ============
window.showMobilePlayer = function() {
    const mobilePlayer = document.getElementById('mobilePlayerView');
    const mobileLib = document.getElementById('mobileLibraryView');
    if (mobilePlayer) mobilePlayer.style.display = 'flex';
    if (mobileLib) mobileLib.style.display = 'none';
    updateMobilePlayer();
};

window.showMobileLibrary = function() {
    const mobilePlayer = document.getElementById('mobilePlayerView');
    const mobileLib = document.getElementById('mobileLibraryView');
    if (mobilePlayer) mobilePlayer.style.display = 'none';
    if (mobileLib) mobileLib.style.display = 'flex';
};

function updateMobilePlayer() {
    const mobileTrack = document.getElementById('mobileTrackName');
    const mobileArtist = document.getElementById('mobileArtistName');
    const mobileCover = document.getElementById('mobileMainCover');
    const mobilePlayIcon = document.getElementById('mobilePlayIcon');
    const mobileTimeCur = document.getElementById('mobileTimeCur');
    const mobileTimeDur = document.getElementById('mobileTimeDur');
    const mobileProgFill = document.getElementById('mobileProgFill');
    const mobileShuffle = document.getElementById('mobileShuffle');
    const mobileRepeat = document.getElementById('mobileRepeat');
    
    if (state.currentIndex !== -1 && state.library[state.currentIndex]) {
        const track = state.library[state.currentIndex];
        if (mobileTrack) mobileTrack.innerText = track.title || 'Unknown';
        if (mobileArtist) mobileArtist.innerText = track.artist || 'Unknown Artist';
        if (mobileCover) mobileCover.src = track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300';
    }
    
    if (mobilePlayIcon) {
        const iconName = state.isPlaying ? 'pause' : 'play';
        mobilePlayIcon.setAttribute('data-lucide', iconName);
    }
    
    if (dom.audio && mobileTimeCur) {
        mobileTimeCur.innerText = formatTime(dom.audio.currentTime);
        mobileTimeDur.innerText = formatTime(dom.audio.duration);
        const progress = (dom.audio.currentTime / dom.audio.duration) * 100 || 0;
        if (mobileProgFill) mobileProgFill.style.width = progress + '%';
    }
    
    if (mobileShuffle) {
        if (state.shuffle) mobileShuffle.classList.add('active');
        else mobileShuffle.classList.remove('active');
    }
    
    if (mobileRepeat) {
        if (state.repeat !== 'none') mobileRepeat.classList.add('active');
        else mobileRepeat.classList.remove('active');
    }
    
    if (window.lucide) window.lucide.createIcons();
}

// Обновление мобильного плеера при изменении трека
const originalPlayTrack = window.playTrack;
window.playTrack = function(id) {
    originalPlayTrack(id);
    if (window.innerWidth <= 1024) {
        setTimeout(updateMobilePlayer, 100);
    }
};

// Spacebar for 2x speed control
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement === document.body) {
        e.preventDefault();
        if (dom.audio) {
            dom.audio.playbackRate = 2.0;
            console.log('[PLAYBACK] Speed: 2x');
        }
    }
}, true);

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        if (dom.audio) {
            dom.audio.playbackRate = 1.0;
            console.log('[PLAYBACK] Speed: 1x');
        }
    }
}, true);

// Обновление при обновлении audio
if (dom && dom.audio) {
    dom.audio.addEventListener('timeupdate', () => {
        if (window.innerWidth <= 1024) {
            const mobileTimeCur = document.getElementById('mobileTimeCur');
            const mobileTimeDur = document.getElementById('mobileTimeDur');
            const mobileProgFill = document.getElementById('mobileProgFill');
            
            if (mobileTimeCur) mobileTimeCur.innerText = formatTime(dom.audio.currentTime);
            if (mobileTimeDur) mobileTimeDur.innerText = formatTime(dom.audio.duration);
            const progress = (dom.audio.currentTime / dom.audio.duration) * 100 || 0;
            if (mobileProgFill) mobileProgFill.style.width = progress + '%';
        }
    });

    // Обновление при play/pause
    dom.audio.addEventListener('play', () => {
        updateMobilePlayer();
    });

    dom.audio.addEventListener('pause', () => {
        updateMobilePlayer();
    });
}

// Обработчик клика на прогресс-бар мобильного плеера
document.addEventListener('click', function(e) {
    const mobileProgBar = document.getElementById('mobileProgBar');
    if (mobileProgBar && mobileProgBar.contains(e.target)) {
        if (dom.audio.duration) {
            const rect = mobileProgBar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            dom.audio.currentTime = percentage * dom.audio.duration;
            updateMobilePlayer();
        }
    }
}, true);

// Export helper functions to window
window.saveQueueState = saveQueueState;
window.restoreQueueState = restoreQueueState;

