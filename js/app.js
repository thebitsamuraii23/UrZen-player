// Главная точка входа приложения
import { state, dom, initDOM } from './state.js';

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
        clear_queue: "Очистить очередь", queue_cleared: "Очередь очищена"
    },
    en: {
        library: "Library", favorites: "Favorites", playlists: "Playlists",
        settings: "Settings", queue: "Queue", ready: "Select Media",
        language: "Localization", bass_boost: "Ultra Bass", reset_db: "Wipe Data",
        create_playlist: "New Collection", save: "Create", cancel: "Cancel",
        import: "Resources", add_files: "Import Tracks", navigation: "Sections",
        choose_playlist: "Add to Playlist", added: "Success Added!", 
        already_exists: "Track already exists", removed: "Removed",
        zen_exit_hint: "Press ESC to exit Zen Mode",
        rename_playlist: "Rename Playlist", confirm: "Confirm", delete: "Delete",
        delete_playlist: "Delete Playlist?", delete_playlist_confirm: "This action cannot be undone",
        renamed: "Renamed", deleted: "Deleted",
        clear_queue: "Clear Queue", queue_cleared: "Queue cleared"
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
    document.getElementById('langSelect').value = state.lang;
    
    const bass = await db.settings.get('bassEnabled');
    if (bass !== undefined) state.bassEnabled = bass.value;
    dom.bassCheck.checked = state.bassEnabled;
    
    const bGain = await db.settings.get('bassGain');
    if (bGain !== undefined) state.bassGain = bGain.value;
    dom.bassSlider.value = state.bassGain;
    dom.bassValText.innerText = state.bassGain + "dB";

    const shuff = await db.settings.get('shuffle');
    if (shuff !== undefined) state.shuffle = shuff.value;

    const rep = await db.settings.get('repeat');
    if (rep !== undefined) state.repeat = rep.value;
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
    state.library.forEach(s => URL.revokeObjectURL(s.url));
    state.library = saved.map(s => ({ ...s, url: URL.createObjectURL(s.fileBlob) }));
    renderLibrary();
}

function getCurrentListView() {
    let list = state.library;
    if (state.currentTab === 'fav') list = state.library.filter(t => t.isFavorite);
    else if (typeof state.currentTab === 'number') {
        const pl = state.playlists.find(p => p.id === state.currentTab);
        list = state.library.filter(t => pl?.songIds.includes(t.id));
    }
    return list;
}

function renderLibrary() {
    dom.playlist.innerHTML = "";
    let list = getCurrentListView();

    list.forEach((track, index) => {
        const isActive = state.currentIndex !== -1 && state.library[state.currentIndex]?.id === track.id;
        const div = document.createElement('div');
        div.className = `song-item ${isActive ? 'active' : ''}`;
        div.draggable = true;
        div.dataset.id = track.id;
        const removeFromPlaylistBtn = (typeof state.currentTab === 'number') ?
            `<button class="mini-btn" onclick="event.stopPropagation(); window.removeSongFromPlaylist(${state.currentTab}, ${track.id})" title="Remove from playlist"><i data-lucide="minus-square"></i></button>` : '';

        div.innerHTML = `
            <img src="${track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'}">
            <div class="song-item-info" title="${track.title}&#10;${track.artist}">
                <h4>${track.title}</h4>
                <p>${track.artist}</p>
            </div>
            <div class="song-actions">
                <button class="mini-btn" onclick="event.stopPropagation(); window.openPlaylistPickerMulti(${track.id})"><i data-lucide="plus"></i></button>
                <button class="mini-btn" onclick="event.stopPropagation(); window.toggleFav(${track.id})"><i data-lucide="heart" style="fill: ${track.isFavorite?'var(--accent)':'none'}; color: ${track.isFavorite?'var(--accent)':'currentColor'}"></i></button>
                ${removeFromPlaylistBtn}
                <button class="mini-btn danger" onclick="event.stopPropagation(); window.deleteTrack(${track.id})"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        div.onclick = () => window.playTrack(track.id);

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

window.deleteTrack = async (id) => {
    if (state.currentIndex !== -1 && state.library[state.currentIndex].id === id) {
        dom.audio.pause();
        state.currentIndex = -1;
        resetUI();
    }
    await db.songs.delete(id);
    await loadLibraryFromDB();
    renderSidebarQueue();
};

function resetUI() {
    dom.trackName.innerText = "Select Media";
    dom.artistName.innerText = "";
    dom.mainCover.src = "";
    dom.vinylContainer.classList.remove('visible');
    updatePlayIcon(false);
}

window.toggleFav = async (id) => {
    const track = state.library.find(t => t.id === id);
    track.isFavorite = !track.isFavorite;
    await db.songs.update(id, { isFavorite: track.isFavorite });
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
            const isActive = state.currentIndex !== -1 && state.library[state.currentIndex]?.id === track.id;
            const div = document.createElement('div');
            div.className = `song-item${isActive ? ' active' : ''}`;
            div.style.cursor = 'pointer';
            div.innerHTML = `
                <img src="${track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'}">
                <div class="song-item-info">
                    <h4>${track.title}</h4>
                    <p>${track.artist}</p>
                </div>
            `;
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                window.playTrack(track.id);
            });
            container.appendChild(div);
        });
    });
}

// ============ ПЛЕЕР ============
window.playTrack = (id) => {
    const track = state.library.find(t => t.id === id);
    state.currentIndex = state.library.findIndex(t => t.id === id);
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

window.nextTrack = () => {
    const view = getCurrentListView();
    if (view.length === 0) return;

    if (state.repeat === 'one') {
        dom.audio.currentTime = 0;
        dom.audio.play();
        return;
    }

    if (state.shuffle) {
        const randomIdx = Math.floor(Math.random() * view.length);
        window.playTrack(view[randomIdx].id);
        return;
    }

    const currentTrackId = state.library[state.currentIndex]?.id;
    const idxInView = view.findIndex(t => t.id === currentTrackId);

    if (idxInView < view.length - 1) {
        window.playTrack(view[idxInView + 1].id);
    } else if (state.repeat === 'all') {
        window.playTrack(view[0].id);
    }
};

window.prevTrack = () => {
    const view = getCurrentListView();
    if (view.length === 0) return;

    const currentTrackId = state.library[state.currentIndex]?.id;
    const idxInView = view.findIndex(t => t.id === currentTrackId);

    if (idxInView > 0) {
        window.playTrack(view[idxInView - 1].id);
    } else if (state.repeat === 'all') {
        window.playTrack(view[view.length - 1].id);
    }
};

window.clearQueue = () => {
    if (state.currentTab !== 'all') {
        showToast(I18N[state.lang].queue_cleared || 'Queue cleared');
        window.switchTab('all');
    } else {
        showToast(I18N[state.lang].queue_cleared || 'Queue cleared');
    }
    renderSidebarQueue();
};

window.togglePlayback = () => {
    if (state.currentIndex === -1 && state.library.length > 0) window.playTrack(state.library[0].id);
    else if (state.currentIndex !== -1) {
        if (dom.audio.paused) dom.audio.play();
        else dom.audio.pause();
    }
};

window.switchTab = (tab) => {
    state.currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    if (tab === 'all') {
        document.getElementById('nav-all')?.classList.add('active');
        document.getElementById('nav-all-mobile')?.classList.add('active');
    } else if (tab === 'fav') {
        document.getElementById('nav-fav')?.classList.add('active');
        document.getElementById('nav-fav-mobile')?.classList.add('active');
    }
    
    renderLibrary();
    renderPlaylistNav();
};

window.toggleShuffle = () => {
    state.shuffle = !state.shuffle;
    db.settings.put({key: 'shuffle', value: state.shuffle});
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

window.openPlaylistPickerMulti = (songId) => {
    state.pendingSongId = songId;
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
        const isIncluded = Array.isArray(pl.songIds) && pl.songIds.includes(songId);
        
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
            const isCurrentlyIncluded = playlist.songIds.includes(songId);
            
            if (!isCurrentlyIncluded) {
                playlist.songIds.push(songId);
            } else {
                playlist.songIds = playlist.songIds.filter(s => s !== songId);
            }
            
            await db.playlists.update(id, { songIds: playlist.songIds });
            await loadPlaylistsFromDB();
            window.openPlaylistPickerMulti(songId);
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

window.removeSongFromPlaylist = async (playlistId, songId) => {
    const pl = await db.playlists.get(playlistId);
    if (!pl) return;
    pl.songIds = Array.isArray(pl.songIds) ? pl.songIds.filter(id => id !== songId) : [];
    await db.playlists.update(playlistId, { songIds: pl.songIds });
    showToast(I18N[state.lang].removed || 'Removed');
    if (state.currentTab === playlistId) renderLibrary();
    await loadPlaylistsFromDB();
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
    dom.loader.classList.remove('hidden');
    const currentCount = await db.songs.count();
    for(let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const meta = await extractMetadata(file);
        await db.songs.add({ 
            title: meta.title, 
            artist: meta.artist, 
            cover: meta.cover, 
            isFavorite: false, 
            fileBlob: file,
            order: currentCount + i
        });
    }
    await loadLibraryFromDB();
    dom.loader.classList.add('hidden');
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
    const steps = [
        { name: 'initDOM', fn: () => initDOM() },
        { name: 'loadSettings', fn: async () => await loadSettings() },
        { name: 'applyLanguage', fn: () => applyLanguage() },
        { name: 'initAudioEvents', fn: () => initAudioEvents() },
        { name: 'initVisualizer', fn: () => initVisualizer() },
        { name: 'initKeybinds', fn: () => initKeybinds() },
        { name: 'loadLibraryFromDB', fn: async () => await loadLibraryFromDB() },
        { name: 'loadPlaylistsFromDB', fn: async () => await loadPlaylistsFromDB() }
    ];

    const setLoaderMsg = (msg) => {
        const lt = document.getElementById('loaderText');
        if (lt) lt.innerText = msg;
        console.log('[Loader]', msg);
    };

    if (typeof Dexie === 'undefined') {
        setLoaderMsg('Missing dependency: Dexie failed to load');
        setTimeout(() => dom.loader?.classList.add('hidden'), 8000);
        return;
    }

    let currentStep = null;
    try {
        const startupWatch = setTimeout(() => {
            setLoaderMsg('Initializing (taking longer than expected)...');
        }, 4000);

        for (const step of steps) {
            currentStep = step.name;
            setLoaderMsg('Running: ' + currentStep);
            await step.fn();
        }

        clearTimeout(startupWatch);
        updateShuffleUI();
        updateRepeatUI();

        document.body.addEventListener('click', () => { 
            if (!state.audioCtx) setupAudioNodes(); 
        }, { once: true });

        setTimeout(() => dom.loader?.classList.add('hidden'), 300);
    } catch (err) {
        console.error('Startup error at', currentStep, err);
        setLoaderMsg('Error during ' + (currentStep || 'startup') + ': ' + (err?.message || String(err)));
        const txt = document.getElementById('loaderText');
        if (txt) txt.title = err?.stack || '';
        setTimeout(() => dom.loader?.classList.add('hidden'), 10000);
    }

    // Event listeners
    dom.playBtn.onclick = window.togglePlayback;
    dom.progBar.onclick = (e) => {
        const p = (e.clientX - dom.progBar.getBoundingClientRect().left) / dom.progBar.offsetWidth;
        dom.audio.currentTime = p * dom.audio.duration;
    };
    dom.volBar.onclick = (e) => {
        const v = (e.clientX - dom.volBar.getBoundingClientRect().left) / dom.volBar.offsetWidth;
        dom.audio.volume = Math.max(0, Math.min(1, v));
        updateVolumeUI();
    };
}
