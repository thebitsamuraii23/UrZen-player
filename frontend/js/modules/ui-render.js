// Модуль для отрисовки UI компонентов
import { state, dom } from '../state.js';
import { refreshIcons } from '../helpers.js';
import { getCurrentListView } from './library-manager.js';

// Экспортируем основные функции рендеринга
export function resetUI() {
    dom.trackName.innerText = "Select Media";
    dom.artistName.innerText = "";
    dom.mainCover.src = "";
    dom.vinylContainer.classList.remove('visible');
    dom.playBtn.innerHTML = '<i data-lucide="play"></i>';
}

export function renderSidebarQueue() {
    const container = document.querySelector('.sidebar-queue');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (state.library.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); padding: 10px; text-align: center; font-size: 0.9em">Queue is empty</div>';
        return;
    }
    
    state.library.slice(0, 3).forEach((track) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.style.cursor = 'pointer';
        div.style.padding = '8px';
        div.style.borderRadius = '6px';
        div.style.backgroundColor = 'var(--surface)';
        div.style.marginBottom = '6px';
        div.style.fontSize = '0.85em';
        div.style.color = 'var(--text-secondary)';
        
        const title = (track.title || 'Unknown').substring(0, 25);
        div.innerHTML = `<span title="${track.title}">${title}</span>`;
        
        div.onclick = () => {
            const idx = state.library.indexOf(track);
            if (idx !== -1) window.playTrack(idx);
        };
        
        container.appendChild(div);
    });
    
    if (state.library.length > 3) {
        const more = document.createElement('div');
        more.style.padding = '8px';
        more.style.color = 'var(--text-secondary)';
        more.style.fontSize = '0.85em';
        more.innerHTML = `... and ${state.library.length - 3} more`;
        container.appendChild(more);
    }
}

export function renderLibrary() {
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
                <button class="mini-btn" onclick="event.stopPropagation(); window.openPlaylistPickerMulti('${trackId}', '${source}')"><i data-lucide="plus"></i></button>
                <button class="mini-btn" onclick="event.stopPropagation(); window.toggleFav('${trackId}', '${source}')"><i data-lucide="heart" style="fill: ${track.isFavorite?'var(--accent)':'none'}; color: ${track.isFavorite?'var(--accent)':'currentColor'}"></i></button>
                ${removeFromPlaylistBtn}
                <button class="mini-btn danger" onclick="event.stopPropagation(); window.deleteTrack('${trackId}', '${source}')"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        div.onclick = () => { eval(onClickHandler); };

        div.addEventListener('dragstart', window.handleDragStart);
        div.addEventListener('dragover', window.handleDragOver);
        div.addEventListener('drop', window.handleDrop);
        div.addEventListener('dragend', window.handleDragEnd);

        dom.playlist.appendChild(div);
    });
    
    refreshIcons();
    renderSidebarQueue();
}

export function renderPlaylistNav() {
    const container = document.getElementById('playlistNav');
    if (!container) return;
    
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'nav-button';
    if (state.currentTab === 'all') allBtn.classList.add('active');
    allBtn.innerHTML = '<i data-lucide="music"></i> All';
    allBtn.onclick = async () => {
        state.currentTab = 'all';
        localStorage.setItem('currentTab', JSON.stringify('all'));
        document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        window.renderLibrary();
    };
    container.appendChild(allBtn);

    const favBtn = document.createElement('button');
    favBtn.className = 'nav-button';
    if (state.currentTab === 'fav') favBtn.classList.add('active');
    favBtn.innerHTML = '<i data-lucide="heart"></i> Favorites';
    favBtn.onclick = async () => {
        state.currentTab = 'fav';
        localStorage.setItem('currentTab', JSON.stringify('fav'));
        document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
        favBtn.classList.add('active');
        window.renderLibrary();
    };
    container.appendChild(favBtn);

    state.playlists.forEach(pl => {
        const btn = document.createElement('button');
        btn.className = 'nav-button';
        if (state.currentTab === pl.id) btn.classList.add('active');
        btn.innerHTML = `<i data-lucide="list"></i> ${pl.name}`;
        btn.onclick = async () => {
            state.currentTab = pl.id;
            localStorage.setItem('currentTab', JSON.stringify(pl.id));
            document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.renderLibrary();
        };
        container.appendChild(btn);
    });

    refreshIcons();
}

export function renderSearchResults(results) {
    dom.playlist.innerHTML = "";
    
    if (!results || results.length === 0) {
        dom.playlist.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No results found</div>';
        return;
    }

    results.forEach((track, index) => {
        const div = document.createElement('div');
        const trackId = track.navidromeId || track.id;
        const source = track.source || 'local';

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

        div.className = 'song-item';
        div.innerHTML = `
            <img src="${track.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'}" onerror="this.src='https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100'">
            <div class="song-item-info" title="${track.title}&#10;${track.artist}">
                <h4>${track.title}${source === 'navidrome' ? ' 🌐' : ''}</h4>
                <p>${track.artist}</p>
            </div>
            <div class="song-actions">
                <button class="mini-btn" onclick="event.stopPropagation(); ${playButtonAction}"><i data-lucide="play"></i></button>
                <button class="mini-btn" onclick="event.stopPropagation(); window.openPlaylistPickerMulti('${trackId}', '${source}')"><i data-lucide="plus"></i></button>
            </div>
        `;

        dom.playlist.appendChild(div);
    });

    refreshIcons();
}
