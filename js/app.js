// Главная точка входа приложения
import { state, dom, initDOM } from './state.js';
import { initAuth } from './auth.js';
import {
    searchLocalLibrary,
    getRandomSongs as getNavidromeRandomSongs,
    getSongsByGenre as getNavidromeSongsByGenre,
    getAlbumList2 as getNavidromeAlbumList,
    getAlbum as getNavidromeAlbum,
    getGenres as getNavidromeGenres,
    getNavidromeCoverArtUrl,
    scrobbleNavidromeSong
} from './navidrome-search.js';
import { loadLibraryFromDB, getCurrentListView, deleteTrack, saveQueueState, restoreQueueState } from './modules/library-manager.js';
import { addSongToPlaylist, removeSongFromPlaylist, createPlaylist, deletePlaylist, renamePlaylist } from './modules/playlist-manager.js';
import { isUserAuthenticated, syncPlaylistsWithServer } from './modules/server-playlist-manager.js';
import { I18N } from './i18n.js?v=20260209-2';
import { formatTime, showToast, refreshIcons } from './helpers.js';
import { loadSettings, applyLanguage, initSettingsHandlers, normalizeLang, t as translate } from './settings.js';

// Инициализация БД
const db = new Dexie("AetherProDB");
db.version(8).stores({
    songs: "++id, navidromeId, title, artist, isFavorite, order",
    playlists: "++id, name",
    settings: "key"
});

const t = (key, fallback = '') => translate(key, fallback);
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300';

function resolveCover(src) {
    return src && String(src).trim().length > 0 ? src : DEFAULT_COVER;
}

function applyImgFallback(img, src = '') {
    if (!img) return;
    img.onerror = () => {
        img.src = DEFAULT_COVER;
    };
    img.src = resolveCover(src);
}

// ============ HOME / RECOMMENDATIONS ============
const HOME_HISTORY_KEY = 'playHistory';
const HOME_HISTORY_LIMIT = 200;
const HOME_REFRESH_COOLDOWN = 60 * 1000;
let homeRefreshInFlight = false;
let homeLastRefresh = 0;
const PLAY_PROGRESS_KEY = 'playProgress';
const PLAY_PROGRESS_THROTTLE = 2500;
let lastProgressSave = 0;

function loadPlayHistory() {
    try {
        const raw = localStorage.getItem(HOME_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('[HOME] Failed to load history:', e);
        return [];
    }
}

function savePlayHistory(items) {
    try {
        localStorage.setItem(HOME_HISTORY_KEY, JSON.stringify(items));
    } catch (e) {
        console.warn('[HOME] Failed to save history:', e);
    }
}

function getHistoryKey(track) {
    const baseId = track?.navidromeId || track?.id || track?.url || track?.title || 'unknown';
    const source = track?.source || 'local';
    return `${source}:${String(baseId)}`;
}

function loadProgressMap() {
    try {
        const raw = localStorage.getItem(PLAY_PROGRESS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        console.warn('[HOME] Failed to load progress map:', e);
        return {};
    }
}

function saveProgressMap(map) {
    try {
        localStorage.setItem(PLAY_PROGRESS_KEY, JSON.stringify(map));
    } catch (e) {
        console.warn('[HOME] Failed to save progress map:', e);
    }
}

function savePlaybackProgress(track, currentTime, duration) {
    if (!track || !Number.isFinite(currentTime)) return;
    if (!duration || !Number.isFinite(duration) || duration <= 0) return;
    if (currentTime < 5) return;
    if (duration - currentTime < 8) {
        clearPlaybackProgress(track);
        return;
    }
    const map = loadProgressMap();
    map[getHistoryKey(track)] = {
        position: currentTime,
        duration,
        updatedAt: Date.now()
    };
    saveProgressMap(map);
}

function clearPlaybackProgress(track) {
    if (!track) return;
    const map = loadProgressMap();
    const key = getHistoryKey(track);
    if (map[key]) {
        delete map[key];
        saveProgressMap(map);
    }
}

function getPlaybackProgress(track) {
    if (!track) return null;
    const map = loadProgressMap();
    return map[getHistoryKey(track)] || null;
}

function applySavedPosition(track) {
    if (!track || !dom.audio) return;
    const progress = getPlaybackProgress(track);
    if (!progress || !progress.position) return;
    dom.audio.addEventListener('loadedmetadata', () => {
        const duration = Number(dom.audio.duration || progress.duration || 0);
        if (!duration) return;
        const target = Math.min(progress.position, Math.max(0, duration - 8));
        if (target > 5 && Number.isFinite(target)) {
            dom.audio.currentTime = target;
        }
    }, { once: true });
}

window.applySavedPosition = applySavedPosition;

function logPlayHistory(track) {
    if (!track) return;
    const history = loadPlayHistory();
    const key = getHistoryKey(track);
    const entry = {
        key,
        id: track.id || null,
        navidromeId: track.navidromeId || null,
        url: track.url || null,
        source: track.source || 'local',
        title: track.title || t('unknown_title', 'Unknown'),
        artist: track.artist || t('unknown_artist', 'Unknown Artist'),
        album: track.album || '',
        cover: track.cover || '',
        genre: track.genre || '',
        playedAt: Date.now()
    };
    const filtered = history.filter(item => item.key !== key);
    filtered.unshift(entry);
    savePlayHistory(filtered.slice(0, HOME_HISTORY_LIMIT));
}

window.logPlayHistory = logPlayHistory;

function splitGenres(value) {
    if (!value) return [];
    return String(value)
        .split(/[,/;|]/)
        .map(s => s.trim())
        .filter(Boolean);
}

function computeTasteProfile(history) {
    const now = Date.now();
    const genreScores = new Map();
    const artistScores = new Map();
    history.forEach((item, idx) => {
        const playedAt = item.playedAt || now;
        const ageDays = Math.max(0, (now - playedAt) / 86400000);
        const recencyWeight = Math.exp(-ageDays / 12);
        const positionWeight = 1 - idx / (history.length + 6);
        const weight = Math.max(0.2, recencyWeight * positionWeight);

        splitGenres(item.genre).forEach((genre) => {
            genreScores.set(genre, (genreScores.get(genre) || 0) + weight);
        });
        if (item.artist) {
            artistScores.set(item.artist, (artistScores.get(item.artist) || 0) + weight);
        }
    });

    const topGenres = Array.from(genreScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([genre]) => genre);

    const topArtists = Array.from(artistScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([artist]) => artist);

    return { topGenres, topArtists };
}

function mapAlbumSong(song, album) {
    if (!song) return null;
    return {
        id: song.id,
        navidromeId: song.id,
        title: song.title || t('unknown_title', 'Unknown'),
        artist: song.artist || album?.artist || t('unknown_artist', 'Unknown Artist'),
        album: song.album || album?.name || '',
        duration: song.duration || 0,
        cover: getNavidromeCoverArtUrl(song.coverArt || album?.coverArt, 300) || '',
        source: 'navidrome',
        genre: song.genre || ''
    };
}

function dedupeTracks(list, history = []) {
    const seen = new Set();
    history.forEach(item => seen.add(getHistoryKey(item)));
    return list.filter(item => {
        const key = getHistoryKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function pickRandomLocal(count = 10) {
    const pool = (state.library || []).filter(item => item && item.title);
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(item => ({
        id: item.id,
        navidromeId: item.navidromeId || null,
        title: item.title,
        artist: item.artist,
        album: item.album || '',
        cover: item.cover || '',
        source: item.source || 'local',
        genre: item.genre || ''
    }));
}

async function fetchRecentFromServer(limit = 10) {
    const albums = await getNavidromeAlbumList('recent', limit);
    if (!albums.length) return [];
    const picks = albums.slice(0, limit);
    const results = await Promise.all(picks.map(async (album) => {
        const albumData = await getNavidromeAlbum(album.id);
        const song = albumData?.song?.[0];
        return mapAlbumSong(song, album);
    }));
    return results.filter(Boolean);
}

async function fetchNewFromServer(limit = 10) {
    const albums = await getNavidromeAlbumList('newest', limit);
    if (!albums.length) return [];
    const picks = albums.slice(0, limit);
    const results = await Promise.all(picks.map(async (album) => {
        const albumData = await getNavidromeAlbum(album.id);
        const song = albumData?.song?.[0];
        return mapAlbumSong(song, album);
    }));
    return results.filter(Boolean);
}

async function fetchRecommendations(profile, history) {
    const results = [];
    const topGenres = profile.topGenres || [];

    for (const genre of topGenres) {
        const byGenre = await getNavidromeSongsByGenre(genre, 10);
        results.push(...byGenre.map(song => ({
            ...song,
            genre: song.genre || genre
        })));
    }

    if (profile.topArtists && profile.topArtists.length) {
        for (const artist of profile.topArtists) {
            const searchResults = await window.searchNavidrome?.(artist) || [];
            const filtered = searchResults.filter(item =>
                String(item.artist || '').toLowerCase().includes(String(artist).toLowerCase())
            );
            results.push(...filtered.slice(0, 6));
        }
    }

    if (results.length < 12) {
        const genre = topGenres[0];
        const extra = await getNavidromeRandomSongs({ size: 12, genre });
        results.push(...extra);
    }

    if (results.length < 12) {
        const extra = await getNavidromeRandomSongs({ size: 12 });
        results.push(...extra);
    }

    return dedupeTracks(results, history).slice(0, 16);
}

function renderHomeGrid(containerId, items, emptyText) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!items || items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'home-empty';
        empty.textContent = emptyText;
        container.appendChild(empty);
        return;
    }
    items.forEach(item => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'home-card';
        const cover = document.createElement('img');
        cover.alt = `${item.title || t('unknown_title', 'Unknown')} cover`;
        applyImgFallback(cover, item.cover);
        const title = document.createElement('div');
        title.className = 'home-card-title';
        title.textContent = item.title || t('unknown_title', 'Unknown');
        const subtitle = document.createElement('div');
        subtitle.className = 'home-card-subtitle';
        subtitle.textContent = item.artist || t('unknown_artist', 'Unknown Artist');
        const chip = document.createElement('div');
        chip.className = 'home-card-chip';
        if (item.progress && item.progress.position) {
            const mins = Math.floor(item.progress.position / 60);
            const secs = Math.floor(item.progress.position % 60).toString().padStart(2, '0');
            chip.textContent = `${t('continue_listening', 'Continue')} · ${mins}:${secs}`;
        } else {
            chip.textContent = item.genre || (item.source === 'navidrome' ? 'Server' : 'Local');
        }
        card.appendChild(cover);
        card.appendChild(title);
        card.appendChild(subtitle);
        card.appendChild(chip);
        card.onclick = async () => {
            if (item.source === 'navidrome') {
                const songId = item.navidromeId || item.id;
                if (songId) {
                    window.playNavidromeSong(songId, item.title, item.artist, item.album, item.cover);
                }
            } else if (item.id !== null && item.id !== undefined) {
                window.playTrack(item.id);
            }
            if (item.progress) {
                applySavedPosition(item);
            }
            updateHomeVisibility();
        };
        container.appendChild(card);
    });
}

function updateHomeVisibility(force = false) {
    const shouldShow = state.currentTab === 'home';
    document.body.classList.toggle('home-visible', shouldShow);
    const homeSection = document.getElementById('homeSection');
    if (homeSection) homeSection.style.display = shouldShow ? 'flex' : 'none';
    const mobileLibraryView = document.getElementById('mobileLibraryView');
    if (mobileLibraryView) mobileLibraryView.style.display = shouldShow ? 'none' : 'flex';

    if (shouldShow) {
        const playerControls = document.getElementById('playerControls');
        const rightPanel = document.querySelector('.right');
        const topSearch = document.getElementById('topSearch');
        const rightQueueShow = document.getElementById('rightQueueShowBtn');
        const hasAudio = !!(dom.audio && dom.audio.src);
        if (topSearch) topSearch.style.display = 'none';
        if (playerControls) playerControls.style.display = hasAudio ? 'flex' : 'none';
        if (rightPanel) rightPanel.style.display = (hasAudio && !state.hideRightQueue) ? 'flex' : 'none';
        if (rightQueueShow) rightQueueShow.style.display = hasAudio && state.hideRightQueue ? 'flex' : 'none';
    }

    if (shouldShow && (force || Date.now() - homeLastRefresh > HOME_REFRESH_COOLDOWN)) {
        window.refreshHome();
    }
}

window.updateHomeVisibility = updateHomeVisibility;

window.refreshHome = async (force = false) => {
    if (homeRefreshInFlight) return;
    const now = Date.now();
    if (!force && now - homeLastRefresh < HOME_REFRESH_COOLDOWN) return;
    homeRefreshInFlight = true;
    homeLastRefresh = now;

    const status = document.getElementById('homeStatus');
    if (status) status.textContent = t('loading_status', 'Loading...');

    try {
        const history = loadPlayHistory();
        const taste = computeTasteProfile(history);
        if (!taste.topGenres.length) {
            const serverGenres = await getNavidromeGenres();
            taste.topGenres = (serverGenres || [])
                .map(item => item.value || item.name || item.genre || '')
                .filter(Boolean)
                .slice(0, 3);
        }
        const tasteHint = document.getElementById('homeTasteHint');
        if (tasteHint) {
            tasteHint.textContent = taste.topGenres.length
                ? `${t('because_you_listen', 'Because you listen to')} ${taste.topGenres[0]}`
                : t('home_subtitle', 'We are tuning recommendations for you.');
        }

        const recommendedTitle = document.getElementById('homeRecommendedTitle');
        if (recommendedTitle && taste.topGenres.length) {
            recommendedTitle.textContent = `${t('recommended_for_you', 'Recommended for you')} · ${taste.topGenres[0]}`;
        }

        const progressMap = loadProgressMap();
        let continueList = history.slice(0, 12).map(item => ({
            id: item.id,
            navidromeId: item.navidromeId,
            title: item.title,
            artist: item.artist,
            album: item.album,
            cover: item.cover,
            source: item.source,
            genre: item.genre,
            progress: progressMap[item.key] || null
        }));

        let recentList = await fetchRecentFromServer(10);
        if (!recentList.length) {
            recentList = history.slice(0, 10).map(item => ({
                id: item.id,
                navidromeId: item.navidromeId,
                title: item.title,
                artist: item.artist,
                album: item.album,
                cover: item.cover,
                source: item.source,
                genre: item.genre
            }));
        }

        let recommended = await fetchRecommendations(taste, history);
        if (!recommended.length) {
            recommended = pickRandomLocal(12);
        }

        let newList = await fetchNewFromServer(10);
        if (!newList.length) {
            const year = new Date().getFullYear();
            const fresh = await getNavidromeRandomSongs({ size: 10, fromYear: year - 1, toYear: year });
            newList = fresh.length ? fresh : pickRandomLocal(10);
        }

        continueList = dedupeTracks(continueList);
        recentList = dedupeTracks(recentList, continueList);
        recommended = dedupeTracks(recommended, [...continueList, ...recentList]);
        newList = dedupeTracks(newList, [...continueList, ...recentList, ...recommended]);

        renderHomeGrid('homeContinueGrid', continueList, t('home_continue_empty', 'Start playing music to see history here.'));
        renderHomeGrid('homeRecentGrid', recentList, t('home_recent_empty', 'No recent plays yet.'));
        renderHomeGrid('homeRecommendationsGrid', recommended, t('home_reco_empty', 'We need more listening data.'));
        renderHomeGrid('homeNewGrid', newList, t('home_new_empty', 'No new releases found.'));

        if (status) status.textContent = '';
    } catch (error) {
        console.error('[HOME] Failed to refresh:', error);
        if (status) status.textContent = t('home_load_failed', 'Failed to load recommendations.');
    } finally {
        homeRefreshInFlight = false;
    }
};

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

function ensureNavidromeStyles() {
    if (document.getElementById('navidromeStyles')) return;
    const style = document.createElement('style');
    style.id = 'navidromeStyles';
    style.textContent = `
        #navidromeContainer.music-tab {
            background: #0c0c0e;
            color: #f1f1f1;
            overflow: hidden;
        }
        #navidromeContainer.music-tab::before {
            content: "";
            position: fixed;
            inset: 0;
            background:
                radial-gradient(1200px 600px at 20% -10%, rgba(255, 255, 255, 0.06), transparent 60%),
                radial-gradient(900px 520px at 90% 10%, rgba(255, 140, 0, 0.12), transparent 60%);
            pointer-events: none;
            z-index: 0;
            animation: navidromeGlow 12s ease-in-out infinite;
        }
        #navidromeContainer.music-tab::after {
            content: "";
            position: fixed;
            inset: 0;
            background: linear-gradient(180deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.6));
            pointer-events: none;
            z-index: 0;
            animation: navidromeVeil 10s ease-in-out infinite;
        }
        #navidromeContainer.music-tab > * {
            position: relative;
            z-index: 1;
        }
        #navidromeContainer.music-tab.music-tab-visible {
            animation: navidromeFadeIn 0.45s ease both;
        }
        .music-tab-header {
            background: linear-gradient(135deg, rgba(13, 13, 13, 0.98), rgba(26, 26, 26, 0.98));
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(8px);
        }
        .music-tab-visible .music-tab-header {
            animation: navidromeHeaderIn 0.55s ease both;
        }
        .music-tab-back {
            background: linear-gradient(135deg, #0a0a0a, #1a1a1a);
            color: #f4f4f4;
            border-radius: 999px;
            letter-spacing: 0.3px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.03);
            position: relative;
            overflow: hidden;
            transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
            font-size: 12px;
            padding: 10px 14px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            width: 42px;
            height: 42px;
            justify-content: center;
        }
        .music-tab-back::after {
            content: "";
            position: absolute;
            inset: -40% -20%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), transparent);
            transform: translateX(-120%) rotate(10deg);
            transition: transform 0.5s ease;
        }
        .music-tab-back-icon {
            width: 16px;
            height: 16px;
            display: inline-block;
            position: relative;
        }
        .music-tab-back-icon::before,
        .music-tab-back-icon::after {
            content: "";
            position: absolute;
            left: 2px;
            top: 50%;
            width: 12px;
            height: 2px;
            background: #f4f4f4;
            border-radius: 999px;
            transform: translateY(-50%);
            box-shadow: 0 0 12px rgba(255, 255, 255, 0.25);
        }
        .music-tab-back-icon::after {
            width: 8px;
            height: 8px;
            border-left: 2px solid #f4f4f4;
            border-bottom: 2px solid #f4f4f4;
            background: transparent;
            transform: translateY(-50%) rotate(45deg);
            left: 1px;
            box-shadow: none;
        }
        .music-tab-back:hover {
            transform: translateY(-1px) scale(1.03);
            border-color: rgba(255, 255, 255, 0.18);
            box-shadow: 0 14px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
        }
        .music-tab-back:hover::after {
            transform: translateX(120%) rotate(10deg);
        }
        .music-tab-back:active {
            transform: translateY(0) scale(0.99);
        }
        .music-tab-back:hover .music-tab-back-icon::before {
            animation: navidromeArrowPulse 0.6s ease;
        }
        .music-tab-back:hover .music-tab-back-icon::after {
            animation: navidromeArrowNudge 0.6s ease;
        }
        .music-tab-search {
            background: rgba(20, 20, 20, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
            color: #f5f5f5;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02), 0 10px 20px rgba(0, 0, 0, 0.25);
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .music-tab-search:focus {
            outline: none;
            border-color: rgba(255, 140, 0, 0.6);
            box-shadow: 0 0 0 3px rgba(255, 140, 0, 0.2), 0 12px 20px rgba(0, 0, 0, 0.35);
        }
        .music-tab-grid {
            padding: 32px 32px 56px;
            gap: 24px;
        }
        .music-tab-visible .music-tab-grid {
            animation: navidromeGridIn 0.6s ease both;
        }
        .navidrome-song-tile {
            background: linear-gradient(180deg, rgba(28, 28, 28, 0.98), rgba(12, 12, 12, 0.98));
            border: 1px solid rgba(255, 255, 255, 0.07);
            box-shadow: 0 16px 28px rgba(0, 0, 0, 0.35);
            animation: navidromeTileIn 0.5s ease var(--tile-delay, 0s) both;
            will-change: transform, box-shadow;
        }
        .navidrome-song-tile.active {
            border-color: rgba(255, 140, 0, 0.5);
            box-shadow: 0 16px 30px rgba(255, 140, 0, 0.2);
        }
        .navidrome-song-tile:hover {
            transform: translateY(-6px) scale(1.03);
            box-shadow: 0 24px 40px rgba(0, 0, 0, 0.45);
        }
        .navidrome-queue-btn {
            position: absolute;
            right: 10px;
            top: 10px;
            background: rgba(12, 12, 12, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #f5f5f5;
            width: 34px;
            height: 34px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
            z-index: 20;
        }
        .navidrome-queue-btn:hover {
            transform: translateY(-2px);
            background: rgba(18, 18, 18, 0.95);
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.4);
        }
        .navidrome-queue-btn:active {
            transform: translateY(0);
        }
        .music-tab-visible .navidrome-queue-btn {
            animation: navidromeQueuePop 0.45s ease both;
        }
        .navidrome-playlist-btn {
            position: absolute;
            left: 10px;
            top: 10px;
            background: rgba(12, 12, 12, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #f5f5f5;
            width: 34px;
            height: 34px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
            z-index: 20;
        }
        .navidrome-playlist-btn:hover {
            transform: translateY(-2px);
            background: rgba(18, 18, 18, 0.95);
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.4);
        }
        .navidrome-playlist-btn:active {
            transform: translateY(0);
        }
        @keyframes navidromeFadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes navidromeHeaderIn {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes navidromeGridIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes navidromeTileIn {
            from { opacity: 0; transform: translateY(12px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes navidromeGlow {
            0%, 100% { opacity: 0.7; transform: translateY(0); }
            50% { opacity: 1; transform: translateY(12px); }
        }
        @keyframes navidromeVeil {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.7; }
        }
        @keyframes navidromeQueuePop {
            from { opacity: 0; transform: translateY(6px) scale(0.9); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes navidromeArrowPulse {
            0% { transform: translateY(-50%) translateX(0); opacity: 0.7; }
            60% { transform: translateY(-50%) translateX(-2px); opacity: 1; }
            100% { transform: translateY(-50%) translateX(0); opacity: 0.9; }
        }
        @keyframes navidromeArrowNudge {
            0% { transform: translateY(-50%) rotate(45deg) translateX(0); }
            60% { transform: translateY(-50%) rotate(45deg) translateX(-2px); }
            100% { transform: translateY(-50%) rotate(45deg) translateX(0); }
        }
    `;
    document.head.appendChild(style);
}

function updateSyncStatus(statusKey, fallback, withTime = false) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    let text = t(statusKey, fallback);
    if (withTime) {
        try {
            const time = new Date().toLocaleTimeString();
            text = `${text} • ${time}`;
        } catch (e) {}
    }
    el.textContent = text;
}

window.syncNowPlaylists = async () => {
    if (!isUserAuthenticated()) {
        updateSyncStatus('sync_status_login', 'Sign in to sync');
        showToast(t('sync_requires_login', 'Please sign in to sync'));
        return;
    }
    updateSyncStatus('sync_status_syncing', 'Syncing...');
    try {
        await syncPlaylistsWithServer(state.playlists, db);
        await loadPlaylistsFromDB();
        if (typeof state.currentTab === 'number') renderLibrary();
        updateSyncStatus('sync_status_done', 'Synced', true);
    } catch (err) {
        console.warn('[SYNC] Manual sync failed:', err);
        updateSyncStatus('sync_status_failed', 'Sync failed');
    }
};

window.handlePostLoginSync = async () => {
    if (!isUserAuthenticated()) return;
    try {
        updateSyncStatus('sync_status_syncing', 'Syncing...');
        if (window.syncAccountMediaServer) {
            await window.syncAccountMediaServer();
        }
        await syncPlaylistsWithServer(state.playlists, db);
        await loadPlaylistsFromDB();
        if (typeof state.currentTab === 'number') renderLibrary();
        updateSyncStatus('sync_status_done', 'Synced', true);
    } catch (err) {
        console.warn('[SYNC] Post-login sync failed:', err);
        updateSyncStatus('sync_status_failed', 'Sync failed');
    }
};

window.saveNewPlaylist = async () => {
    const name = document.getElementById('playlistNameInp').value;
    if (!name) return;
    const localId = await createPlaylist(name);
    
    // Sync with server if authenticated
    if (isUserAuthenticated()) {
        try {
            const { createServerPlaylist } = await import('./modules/server-playlist-manager.js');
            const created = await createServerPlaylist(name);
            if (created?.id) {
                await db.playlists.update(localId, { serverId: created.id });
            }
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
            const { deleteServerPlaylist, fetchServerPlaylists } = await import('./modules/server-playlist-manager.js');
            let serverId = playlist.serverId;
            if (!serverId) {
                const serverPlaylists = await fetchServerPlaylists();
                const match = serverPlaylists.find(p => p.name === playlist.name);
                serverId = match?.id;
            }
            if (serverId) {
                await deleteServerPlaylist(serverId);
            }
            console.log('[SYNC] Deleted playlist on server');
        } catch (error) {
            console.error('[SYNC] Failed to delete playlist on server:', error);
        }
    }
    
    await loadPlaylistsFromDB();
    if (state.currentTab === id) window.switchTab('all');
    
    deleteData.playlistId = null;
    window.toggleModal('deletePlaylistModal');
    showToast(t('deleted', 'Deleted'));
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
            const { renameServerPlaylist, fetchServerPlaylists } = await import('./modules/server-playlist-manager.js');
            let serverId = state.playlists.find(p => p.id === id)?.serverId;
            if (!serverId) {
                const serverPlaylists = await fetchServerPlaylists();
                const match = serverPlaylists.find(p => p.name === oldName);
                serverId = match?.id;
                if (serverId) {
                    await db.playlists.update(id, { serverId });
                }
            }
            if (serverId) {
                await renameServerPlaylist(serverId, newName);
            }
            console.log('[SYNC] Renamed playlist on server');
        } catch (error) {
            console.error('[SYNC] Failed to rename playlist on server:', error);
        }
    }
    
    await loadPlaylistsFromDB();
    
    renameData.playlistId = null;
    renameData.oldName = null;
    window.toggleModal('renamePlaylistModal');
    showToast(t('renamed', 'Renamed'));
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
        const isActive = currentTrack && (
            currentTrack.id === track.id ||
            currentTrack.navidromeId === track.navidromeId ||
            (currentTrack.url && track.url && currentTrack.url === track.url)
        );
        const div = document.createElement('div');
        div.className = `song-item ${isActive ? 'active' : ''}`;
        div.draggable = true;
        const source = track.source || 'local';
        const trackId = source === 'navidrome'
            ? (track.navidromeId || track.url || track.id)
            : track.id;
        div.dataset.id = trackId;
        
        const isFavView = state.currentTab === 'fav';
        const removeFromPlaylistBtn = (typeof state.currentTab === 'number') ?
            `<button class="mini-btn" onclick="event.stopPropagation(); window.removeSongFromPlaylist(${state.currentTab}, '${trackId}', '${source}')" title="${t('remove_from_playlist', 'Remove from playlist')}"><i data-lucide="minus-square"></i></button>` : '';
        const playNextAction = source === 'navidrome'
            ? `window.addToQueueNextNavidrome('${trackId}')`
            : `window.addToQueueNextLocal(${trackId})`;
        const playNextBtn = `<button class="mini-btn" onclick="event.stopPropagation(); ${playNextAction}" title="${t('play_next', 'Play next')}"><i data-lucide="list-plus"></i></button>`;
        const removeBtn = isFavView
            ? `<button class="mini-btn danger" onclick="event.stopPropagation(); window.toggleFav('${trackId}', '${source}')" title="${t('fav_removed', 'Removed from favorites')}"><i data-lucide="heart-off"></i></button>`
            : `<button class="mini-btn danger" onclick="event.stopPropagation(); window.removeFromQueue('${trackId}')" title="${t('remove_from_queue', 'Remove from queue')}"><i data-lucide="trash-2"></i></button>`;

        // Экранируем кавычки для безопасности
        const safeTitle = (track.title || t('unknown_title', 'Unknown')).replace(/'/g, "\\'");
        const safeArtist = (track.artist || t('unknown_artist', 'Unknown Artist')).replace(/'/g, "\\'");
        const safeAlbum = (track.album || '').replace(/'/g, "\\'");
        const safeCover = (resolveCover(track.cover) || '').replace(/'/g, "\\'");

        let onClickHandler;
        if (source === 'navidrome') {
            onClickHandler = `window.playNavidromeSong('${trackId}', '${safeTitle}', '${safeArtist}', '${safeAlbum}', '${safeCover}')`;
        } else {
            onClickHandler = `window.playTrack(${trackId})`;
        }

        const trackTitle = track.title || t('unknown_title', 'Unknown');
        const trackArtist = track.artist || t('unknown_artist', 'Unknown Artist');

        div.innerHTML = `
            <img src="${resolveCover(track.cover)}" onerror="this.src='${DEFAULT_COVER}'">
            <div class="song-item-info" title="${trackTitle}&#10;${trackArtist}">
                <h4>${trackTitle}${source === 'navidrome' ? ' 🌐' : ''}</h4>
                <p>${trackArtist}</p>
            </div>
            <div class="song-actions">
                <button class="mini-btn" onclick="event.stopPropagation(); window.openPlaylistPickerMulti('${trackId}', '${source}')"><i data-lucide="plus"></i></button>
                <button class="mini-btn" onclick="event.stopPropagation(); window.toggleFav('${trackId}', '${source}')"><i data-lucide="heart" style="fill: ${track.isFavorite?'var(--accent)':'none'}; color: ${track.isFavorite?'var(--accent)':'currentColor'}"></i></button>
                ${playNextBtn}
                ${removeFromPlaylistBtn}
                ${removeBtn}
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
        navidromeContainer.classList.add('music-tab');
        ensureNavidromeStyles();
        const header = navidromeContainer.querySelector('div');
        if (header) {
            header.classList.add('music-tab-header');
            header.style.removeProperty('background');
            header.style.removeProperty('border-bottom');
        }
        const oldAddBtn = header ? header.querySelector('#navidromeAddPlaylistBtn') : null;
        if (oldAddBtn) oldAddBtn.remove();
        const backBtn = navidromeContainer.querySelector('button');
        if (backBtn) {
            backBtn.classList.add('music-tab-back');
            backBtn.setAttribute('aria-label', t('back', 'Back'));
            backBtn.innerHTML = '<span class="music-tab-back-icon" aria-hidden="true"></span>';
            backBtn.style.cssText = 'border: none; padding: 10px 14px; cursor: pointer; font-weight: 600;';
        }
        const searchInput = navidromeContainer.querySelector('#navidromeSearchInput');
        if (searchInput) {
            searchInput.classList.add('music-tab-search');
            searchInput.style.cssText = 'flex: 1; padding: 10px 15px; font-size: 14px;';
        }
        const grid = navidromeContainer.querySelector('#navidromeGrid');
        if (grid) {
            grid.classList.add('music-tab-grid');
            grid.style.removeProperty('padding');
            grid.style.removeProperty('gap');
        }
        // Контейнер уже есть, просто обновим сетку
        updateNavidromeSongs();
        return;
    }
    
    // Создаём контейнер ОДИН раз
    navidromeContainer = document.createElement('div');
    navidromeContainer.id = 'navidromeContainer';
    navidromeContainer.classList.add('music-tab');
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

    ensureNavidromeStyles();
    
    // Верхняя панель с поиском и кнопкой назад (создаём один раз)
    const header = document.createElement('div');
    header.className = 'music-tab-header';
    header.style.cssText = `
        padding: 20px;
        display: flex;
        gap: 15px;
        align-items: center;
        flex-shrink: 0;
    `;
    
    const backBtn = document.createElement('button');
    backBtn.className = 'music-tab-back';
    backBtn.setAttribute('aria-label', t('back', 'Back'));
    backBtn.innerHTML = '<span class="music-tab-back-icon" aria-hidden="true"></span>';
    backBtn.style.cssText = 'border: none; padding: 10px 14px; cursor: pointer; font-weight: 600;';
    backBtn.onclick = () => window.switchTab('all');
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'navidromeSearchInput';
    searchInput.className = 'music-tab-search';
    searchInput.placeholder = t('search_navidrome_placeholder', 'Search Navidrome...');
    searchInput.value = state.searchQuery || '';
    searchInput.style.cssText = 'flex: 1; padding: 10px 15px; font-size: 14px;';
    
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
    grid.className = 'music-tab-grid';
    grid.style.cssText = `
        flex: 1;
        overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
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
            loadingMsg.innerHTML = `<p>🌐 ${t('navidrome_loading', 'Loading Navidrome songs...')}</p>`;
            grid.appendChild(loadingMsg);
            window.getAllNavidromeSongs().then((songs) => {
                state.navidromeSongs = songs;
                grid.innerHTML = '';
                if (songs.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
                    emptyMsg.innerHTML = `<p>🌐 ${t('no_songs_found', 'No songs found')}</p>`;
                    grid.appendChild(emptyMsg);
                } else {
                    renderNavidromeTiles(songs, grid);
                }
            }).catch(() => {
                grid.innerHTML = '';
                const errorMsg = document.createElement('div');
                errorMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
                errorMsg.innerHTML = `<p>⚠️ ${t('navidrome_load_failed', 'Failed to load Navidrome songs')}</p>`;
                grid.appendChild(errorMsg);
            });
            return;
        }
        if (list.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
            emptyMsg.innerHTML = `<p>🌐 ${t('no_songs_found', 'No songs found')}</p>`;
            grid.appendChild(emptyMsg);
            return;
        }
        renderNavidromeTiles(list, grid);
        return;
    }
    
    // If there's a search query, use API search
    const searchMsg = document.createElement('div');
    searchMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
    searchMsg.innerHTML = `<p>🔍 ${t('searching', 'Searching...')}</p>`;
    grid.appendChild(searchMsg);
    
    // Use the searchNavidrome function from navidrome-search.js
    if (window.searchNavidrome) {
        window.searchNavidrome(state.searchQuery).then((results) => {
            grid.innerHTML = ''; // Clear loading message
            
            if (results.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
                emptyMsg.innerHTML = `<p>🌐 ${t('no_songs_found', 'No songs found')}</p>`;
                grid.appendChild(emptyMsg);
                return;
            }
            
            renderNavidromeTiles(results, grid);
        }).catch(err => {
            console.error('[NAV] Search error:', err);
            grid.innerHTML = '';
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = 'grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);';
            errorMsg.innerHTML = `<p>⚠️ ${t('search_error', 'Search error')}</p>`;
            grid.appendChild(errorMsg);
        });
    }
}

// Функция для отрисовки плиток песен
function renderNavidromeTiles(list, grid) {
    list.forEach((track, idx) => {
        const currentTrack = state.currentIndex !== -1 ? state.library[state.currentIndex] : null;
        const isActive = currentTrack && (
            currentTrack.id === track.id ||
            currentTrack.navidromeId === track.navidromeId ||
            (currentTrack.url && track.url && currentTrack.url === track.url)
        );
        const displayTitle = track.title || t('unknown_title', 'Unknown');
        const displayArtist = track.artist || t('unknown_artist', 'Unknown Artist');
        
        const tile = document.createElement('div');
        tile.className = `navidrome-song-tile ${isActive ? 'active' : ''}`;
        tile.style.cssText = `
            cursor: pointer;
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            height: 220px;
        `;
        tile.style.setProperty('--tile-delay', `${Math.min(idx * 0.03, 0.45)}s`);
        
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

        // Store track for quick access (queue add button)
        if (!window.tempNavidromeTracks) window.tempNavidromeTracks = {};

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
                <p style="margin: 0; font-size: 13px; color: var(--text-dim); margin-bottom: 8px;">${t('artist', 'Artist')}</p>
                <p style="margin: 0; font-size: 14px; font-weight: 600; word-break: break-word;">${displayArtist}</p>
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
                ${displayTitle}
            </h4>
        `;
        
        tile.appendChild(imgContainer);
        tile.appendChild(info);
        
        const trackId = track.navidromeId || track.id;
        const safeTitle = displayTitle.replace(/'/g, "\\'");
        const safeArtist = displayArtist.replace(/'/g, "\\'");
        const safeAlbum = (track.album || '').replace(/'/g, "\\'");
        const safeCover = (resolveCover(track.cover) || '').replace(/'/g, "\\'");

        window.tempNavidromeTracks[String(trackId)] = track;

        const queueBtn = document.createElement('button');
        queueBtn.className = 'navidrome-queue-btn';
        queueBtn.title = t('add_to_queue_next', 'Add to queue (play next)');
        queueBtn.innerHTML = '<i data-lucide="plus"></i>';
        queueBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.addToQueueNextNavidrome) {
                window.addToQueueNextNavidrome(trackId);
            }
        };
        imgContainer.appendChild(queueBtn);

        const playlistBtn = document.createElement('button');
        playlistBtn.className = 'navidrome-playlist-btn';
        playlistBtn.title = t('add_to_playlist', 'Add to playlist');
        playlistBtn.innerHTML = '<i data-lucide="list-plus"></i>';
        playlistBtn.onclick = (e) => {
            e.stopPropagation();
            window.tempPendingTrack = track;
            window.lastNavidromeSelection = { id: trackId, source: 'navidrome', track };
            window.openPlaylistPickerMulti(trackId, 'navidrome');
        };
        imgContainer.appendChild(playlistBtn);
        
        tile.onclick = () => {
            // Animate tile and open player
            tile.style.animation = 'scaleToPlayer 0.6s ease-in-out forwards';
            window.lastNavidromeSelection = { id: trackId, source: 'navidrome', track };
            window.tempPendingTrack = track;
            
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

    refreshIcons();
}

function renderNavidromeInterface() {
    initNavidromeContainer();
    // Always refresh Navidrome grid when entering the tab
    setTimeout(() => {
        if (typeof updateNavidromeSongs === 'function') updateNavidromeSongs();
    }, 0);
}

window.openMusicTabPlaylistPicker = () => {
    let trackId = null;
    let source = null;
    const last = window.lastNavidromeSelection;
    if (last && last.id) {
        trackId = last.id;
        source = last.source || 'navidrome';
        if (last.track) window.tempPendingTrack = last.track;
    } else if (state.currentIndex !== -1 && state.library[state.currentIndex]) {
        const track = state.library[state.currentIndex];
        source = track.source === 'navidrome' ? 'navidrome' : 'local';
        trackId = source === 'navidrome'
            ? (track.navidromeId || track.url || track.id)
            : track.id;
    }
    if (!trackId) {
        showToast(t('track_data_unavailable', 'Error: Track data not available'));
        return;
    }
    window.openPlaylistPickerMulti(trackId, source);
};

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
        if (Number.isNaN(draggedId) || Number.isNaN(targetId)) {
            return;
        }
        
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
        dom.playlist.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">${t('no_results_found', 'No results found')}</div>`;
        return;
    }

    results.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = 'song-item';
        const trackId = track.source === 'navidrome'
            ? (track.navidromeId || track.url || track.id)
            : track.id;
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

        const safeTitle = (track.title || t('unknown_title', 'Unknown')).replace(/'/g, "\\'");
        const safeArtist = (track.artist || t('unknown_artist', 'Unknown Artist')).replace(/'/g, "\\'");
        const safeAlbum = (track.album || '').replace(/'/g, "\\'");
        const safeCover = (resolveCover(track.cover) || '').replace(/'/g, "\\'");

        let playButtonAction;
        if (track.source === 'navidrome') {
            playButtonAction = `window.playNavidromeSong('${trackId}', '${safeTitle}', '${safeArtist}', '${safeAlbum}', '${safeCover}')`;
        } else {
            playButtonAction = `window.playTrack(${trackId})`;
        }

        div.innerHTML = `
            <img src="${resolveCover(track.cover)}" alt="${track.title || t('unknown_title', 'Unknown')}" onerror="this.src='${DEFAULT_COVER}'">
            <div class="song-item-info" title="${track.title || t('unknown_title', 'Unknown')}&#10;${track.artist || t('unknown_artist', 'Unknown Artist')}">
                <h4>${track.title || t('unknown_title', 'Unknown')}${track.source === 'navidrome' ? ' 🌐' : ''}</h4>
                <p>${track.artist || t('unknown_artist', 'Unknown Artist')}</p>
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
    let normalizedId = id;
    if (source !== 'navidrome') {
        const n = Number(id);
        if (!Number.isNaN(n)) normalizedId = n;
    }
    await deleteTrack(normalizedId, source);
};

function resetUI() {
    dom.trackName.innerText = t('ready', 'Select Media');
    dom.artistName.innerText = "";
    dom.mainCover.src = "";
    dom.vinylContainer.classList.remove('visible');
    if (dom.audio) {
        dom.audio.removeAttribute('src');
        try { dom.audio.load(); } catch (e) {}
    }
    updatePlayIcon(false);
    updateHomeVisibility(true);
}

window.toggleFav = async (id, source = 'local') => {
    let normalizedId = id;
    if (source !== 'navidrome') {
        const n = Number(id);
        if (!Number.isNaN(n)) normalizedId = n;
    }
    const track = state.library.find(t => t.id === normalizedId || t.navidromeId === normalizedId || t.url === normalizedId);
    if (!track) return;
    
    track.isFavorite = !track.isFavorite;
    
    if (source === 'local') {
        await db.songs.update(normalizedId, { isFavorite: track.isFavorite });
    } else {
        const favorites = JSON.parse(localStorage.getItem('navidromeFavorites') || '[]');
        if (track.isFavorite) {
            if (!track.url && track.navidromeId && window.getNavidromeStreamUrl) {
                track.url = window.getNavidromeStreamUrl(track.navidromeId);
            }
            if (!favorites.find(f => f.navidromeId === id || f.url === id)) {
                favorites.push(track);
            }
        } else {
            const idx = favorites.findIndex(f => f.navidromeId === id || f.url === id);
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
            container.innerHTML = `<div style="color:var(--text-dim); font-size:13px; padding:12px;">${t('queue_empty', 'Queue is empty')}</div>`;
            return;
        }

        queue.forEach((track, idx) => {
            const currentTrack = state.currentIndex !== -1 ? state.library[state.currentIndex] : null;
            const isActive = currentTrack && (
                currentTrack.id === track.id ||
                currentTrack.navidromeId === track.navidromeId ||
                (currentTrack.url && track.url && currentTrack.url === track.url)
            );
            const source = track.source || 'local';
            const trackId = source === 'navidrome'
                ? (track.navidromeId || track.url || track.id)
                : track.id;
            
            const div = document.createElement('div');
            div.className = `song-item${isActive ? ' active' : ''}`;
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '8px';
            div.style.cursor = 'pointer';
            div.style.position = 'relative';
            
            const safeTitle = (track.title || t('unknown_title', 'Unknown')).replace(/'/g, "\\'");
            const safeArtist = (track.artist || t('unknown_artist', 'Unknown Artist')).replace(/'/g, "\\'");
            const safeAlbum = (track.album || '').replace(/'/g, "\\'");
            const safeCover = (resolveCover(track.cover) || '').replace(/'/g, "\\'");
            
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
            info.innerHTML = `<h4>${safeTitle}${source === 'navidrome' ? ' 🌐' : ''}</h4><p>${safeArtist}</p>`;
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'mini-btn danger';
            deleteBtn.title = 'Remove from queue';
            deleteBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; padding: 6px; color: var(--text-dim); transition: 0.2s;';
            deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width:18px; height:18px;"></i>';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                const libIdx = findLibraryIndex(track);
                console.log('[QUEUE] Removing track libIdx:', libIdx, 'viewIdx:', idx, 'trackId:', trackId);
                if (libIdx !== -1) window.removeFromQueueByIndex(libIdx);
                else window.removeFromQueue(trackId);
            };
            deleteBtn.onmouseover = () => deleteBtn.style.color = '#ff3e00';
            deleteBtn.onmouseout = () => deleteBtn.style.color = 'var(--text-dim)';
            
            const playNextBtn = document.createElement('button');
            playNextBtn.className = 'mini-btn';
            playNextBtn.title = t('play_next', 'Play next');
            playNextBtn.style.cssText = 'background: transparent; border: none; cursor: pointer; padding: 6px; color: var(--text-dim); transition: 0.2s;';
            playNextBtn.innerHTML = '<i data-lucide="list-plus" style="width:18px; height:18px;"></i>';
            playNextBtn.onclick = (e) => {
                e.stopPropagation();
                if (track.source === 'navidrome') {
                    const nextId = track.navidromeId || track.url;
                    window.addToQueueNextNavidrome(nextId);
                } else {
                    if (window.addToQueueNextLocal) {
                        window.addToQueueNextLocal(track.id);
                    }
                }
            };
            playNextBtn.onmouseover = () => playNextBtn.style.color = 'var(--accent)';
            playNextBtn.onmouseout = () => playNextBtn.style.color = 'var(--text-dim)';
            
            // Assemble div
            div.appendChild(img);
            div.appendChild(info);
            div.appendChild(playNextBtn);
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

function clampRightQueueWidth(width) {
    const leftWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--left-sidebar-width')) || 320;
    const minWidth = 220;
    const maxWidth = Math.max(minWidth, Math.min(560, window.innerWidth - leftWidth - 360));
    return Math.max(minWidth, Math.min(maxWidth, width));
}

window.applyRightQueueWidth = (width, persist = false) => {
    const clamped = clampRightQueueWidth(width);
    state.rightQueueWidth = clamped;
    document.documentElement.style.setProperty('--right-sidebar-width', `${clamped}px`);
    if (persist) {
        try { db.settings.put({ key: 'rightQueueWidth', value: clamped }); } catch (e) {}
        localStorage.setItem('rightQueueWidth', String(clamped));
    }
};

window.applyLeftQueueVisibility = (hidden, persist = false) => {
    state.hideLeftQueue = !!hidden;
    document.body.classList.toggle('left-queue-hidden', state.hideLeftQueue);
    if (persist) {
        try { db.settings.put({ key: 'hideLeftQueue', value: state.hideLeftQueue }); } catch (e) {}
        localStorage.setItem('hideLeftQueue', String(state.hideLeftQueue));
    }
};

window.applyRightQueueVisibility = (hidden, persist = false) => {
    state.hideRightQueue = !!hidden;
    document.body.classList.toggle('right-queue-hidden', state.hideRightQueue);
    const rightPanel = document.querySelector('.right');
    if (rightPanel && !state.hideRightQueue) {
        if (state.currentTab === 'navidrome' || state.currentTab === 'about') {
            rightPanel.style.display = 'none';
        } else {
            rightPanel.style.display = 'flex';
        }
    }
    const btn = document.getElementById('rightQueueToggle');
    if (btn) {
        const icon = btn.querySelector('i');
        const key = state.hideRightQueue ? 'show_right_queue' : 'hide_right_queue';
        if (icon) icon.setAttribute('data-lucide', state.hideRightQueue ? 'eye' : 'eye-off');
        btn.setAttribute('data-t-title', key);
        btn.setAttribute('data-t-aria-label', key);
        btn.title = t(key, state.hideRightQueue ? 'Show right queue' : 'Hide right queue');
        btn.setAttribute('aria-label', btn.title);
        refreshIcons();
    }
    if (persist) {
        try { db.settings.put({ key: 'hideRightQueue', value: state.hideRightQueue }); } catch (e) {}
        localStorage.setItem('hideRightQueue', String(state.hideRightQueue));
    }
};

window.toggleLeftQueue = (hidden) => {
    window.applyLeftQueueVisibility(!!hidden, true);
};

window.toggleRightQueue = () => {
    window.applyRightQueueVisibility(!state.hideRightQueue, true);
};

window.applyPerformanceMode = (enabled, persist = false) => {
    state.performanceMode = !!enabled;
    document.body.classList.toggle('performance-mode', state.performanceMode);
    const canvas = document.getElementById('visualizerCanvas');
    if (canvas) canvas.style.display = state.performanceMode ? 'none' : '';
    if (state.performanceMode) {
        stopVisualizer();
    } else if (state.analyser) {
        startVisualizer();
    }
    if (persist) {
        try { db.settings.put({ key: 'performanceMode', value: state.performanceMode }); } catch (e) {}
        localStorage.setItem('performanceMode', String(state.performanceMode));
    }
};

window.togglePerformanceMode = (enabled) => {
    window.applyPerformanceMode(!!enabled, true);
};

function initRightQueueResizer() {
    const handle = document.getElementById('rightQueueResizeHandle');
    if (!handle) return;
    let pendingWidth = state.rightQueueWidth || 320;

    const onPointerMove = (e) => {
        const nextWidth = clampRightQueueWidth(window.innerWidth - e.clientX);
        pendingWidth = nextWidth;
        window.applyRightQueueWidth(nextWidth, false);
    };

    const stopResize = (e) => {
        document.body.classList.remove('resizing');
        try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopResize);
        window.applyRightQueueWidth(pendingWidth, true);
    };

    handle.addEventListener('pointerdown', (e) => {
        if (window.innerWidth <= 1024) return;
        if (state.hideRightQueue) return;
        document.body.classList.add('resizing');
        pendingWidth = state.rightQueueWidth || 320;
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stopResize);
    });

    window.addEventListener('resize', () => {
        if (!state.hideRightQueue) window.applyRightQueueWidth(state.rightQueueWidth || 320, false);
    });
}

// Remove a track from the queue by ID
function normalizeQueueId(value) {
    if (value === undefined || value === null) return '';
    const raw = String(value);
    if (raw.startsWith('http')) {
        try {
            const parsed = new URL(raw);
            parsed.searchParams.delete('f');
            return parsed.toString();
        } catch (e) {
            return raw;
        }
    }
    return raw;
}

function findLibraryIndex(track) {
    if (!track) return -1;
    return state.library.findIndex(t =>
        t === track ||
        normalizeQueueId(t.id) === normalizeQueueId(track.id) ||
        normalizeQueueId(t.navidromeId) === normalizeQueueId(track.navidromeId) ||
        normalizeQueueId(t.url) === normalizeQueueId(track.url)
    );
}

window.removeFromQueue = (trackId) => {
    console.log('[QUEUE] Removing track by id:', trackId);
    const target = normalizeQueueId(trackId);
    const targetNum = Number(target);
    const idx = state.library.findIndex(t => {
        const id = normalizeQueueId(t.id);
        const navId = normalizeQueueId(t.navidromeId);
        const url = normalizeQueueId(t.url);
        if (id === target || navId === target || url === target) return true;
        if (!Number.isNaN(targetNum)) {
            const idNum = Number(t.id);
            const navNum = Number(t.navidromeId);
            if (!Number.isNaN(idNum) && idNum === targetNum) return true;
            if (!Number.isNaN(navNum) && navNum === targetNum) return true;
        }
        return false;
    });
    removeFromQueueByIndex(idx);
};

window.removeFromQueueByIndex = (idx) => {
    if (idx === -1 || idx >= state.library.length) {
        console.warn('[QUEUE] Track index not found:', idx);
        return;
    }
    state.library.splice(idx, 1);
    if (state.currentIndex > idx) state.currentIndex--;
    if (state.currentIndex >= state.library.length) state.currentIndex = -1;
    if (typeof saveQueueState === 'function') saveQueueState();
    renderSidebarQueue();
    renderLibrary();
};

// Add a Navidrome track to queue and make it play next
window.addToQueueNextNavidrome = (trackId) => {
    const id = String(trackId);
    const isUrl = /^https?:\/\//i.test(id);
    const tempMap = window.tempNavidromeTracks || {};
    let track = tempMap[id];
    if (!track && Array.isArray(state.navidromeSongs)) {
        track = state.navidromeSongs.find(t =>
            String(t.id || t.navidromeId) === id ||
            String(t.navidromeId) === id ||
            String(t.url || '') === id
        );
    }
    if (!track) {
        track = state.library.find(t =>
            String(t.id || t.navidromeId) === id ||
            String(t.navidromeId) === id ||
            String(t.url || '') === id
        );
    }
    if (!track) {
        showToast(t('track_data_unavailable', 'Error: Track data not available'));
        return;
    }
    
    const queuedTrack = {
        id: track.id || track.navidromeId || id,
        title: track.title || t('unknown_title', 'Unknown'),
        artist: track.artist || t('unknown_artist', 'Unknown Artist'),
        album: track.album || '',
        duration: track.duration || 0,
        url: isUrl ? id : (window.getNavidromeStreamUrl ? window.getNavidromeStreamUrl(id) : track.url),
        cover: resolveCover(track.cover),
        source: 'navidrome',
        navidromeId: isUrl ? (track.navidromeId || null) : id
    };
    
    let insertIdx = state.currentIndex >= 0 ? state.currentIndex + 1 : state.library.length;
    const existingIdx = state.library.findIndex(t =>
        String(t.id || t.navidromeId) === id ||
        String(t.navidromeId) === id ||
        String(t.url || '') === id
    );
    
    if (existingIdx !== -1) {
        const [existing] = state.library.splice(existingIdx, 1);
        if (existingIdx < insertIdx) insertIdx--;
        state.library.splice(insertIdx, 0, existing);
    } else {
        state.library.splice(insertIdx, 0, queuedTrack);
    }
    
    if (state.currentIndex === -1) {
        if (queuedTrack.source === 'navidrome') {
            window.playNavidromeSong(id, queuedTrack.title, queuedTrack.artist, queuedTrack.album, queuedTrack.cover);
        } else {
            window.playTrack(queuedTrack.id);
        }
        return;
    }
    
    if (existingIdx !== -1 && existingIdx < state.currentIndex) {
        state.currentIndex--;
    }
    if (insertIdx <= state.currentIndex) {
        state.currentIndex++;
    }
    
    state.nextOverrideId = id;
    if (typeof saveQueueState === 'function') saveQueueState();
    renderLibrary();
    renderSidebarQueue();
    showToast(t('added_to_queue_next', 'Added to queue (play next)'));
};

// Add a local track to queue and make it play next
window.addToQueueNextLocal = (trackId) => {
    const id = Number(trackId);
    if (Number.isNaN(id)) return;
    const track = state.library.find(t => t.id === id);
    if (!track) return;
    
    let insertIdx = state.currentIndex >= 0 ? state.currentIndex + 1 : state.library.length;
    const existingIdx = state.library.findIndex(t => t.id === id);
    
    if (existingIdx !== -1) {
        const [existing] = state.library.splice(existingIdx, 1);
        if (existingIdx < insertIdx) insertIdx--;
        state.library.splice(insertIdx, 0, existing);
    }
    
    if (state.currentIndex === -1) {
        window.playTrack(track.id);
        return;
    }
    
    if (existingIdx !== -1 && existingIdx < state.currentIndex) {
        state.currentIndex--;
    }
    if (insertIdx <= state.currentIndex) {
        state.currentIndex++;
    }
    
    state.nextOverrideId = id;
    if (typeof saveQueueState === 'function') saveQueueState();
    renderLibrary();
    renderSidebarQueue();
    showToast(t('play_next', 'Play next'));
};

// ============ ПЛЕЕР ============
window.playTrack = (id) => {
    console.log('🎵 [PLAYTRACK] Called with id:', id);
    const track = state.library.find(t => t.id === id || t.navidromeId === id || t.url === id);
    console.log('🎵 [PLAYTRACK] Found track:', track?.title, track?.artist);
    if (!track) {
        console.error('Track not found:', id);
        return;
    }
    state.currentIndex = state.library.findIndex(t => t.id === id || t.navidromeId === id || t.url === id);
    
    // Если shuffle включен, синхронизировать позицию с выбранным треком
    if (state.shuffle) {
        const trackId = track.navidromeId || track.id;
        if (typeof syncShufflePositionWithTrackId === 'function') {
            syncShufflePositionWithTrackId(trackId);
        }
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
    
    const displayTitle = track.title || t('unknown_title', 'Unknown');
    const displayArtist = track.artist || t('unknown_artist', 'Unknown Artist');
    const displayAlbum = track.album || '';
    if (!track.title) track.title = displayTitle;
    if (!track.artist) track.artist = displayArtist;
    if (!track.album) track.album = displayAlbum;

    console.log('[PLAYBACK] Playing:', displayTitle, 'from', track.source, 'navidromeId:', track.navidromeId);
    dom.audio.src = audioSrc;
    dom.audio.crossOrigin = 'anonymous';
    applySavedPosition(track);
    dom.audio.play().catch(err => {
        console.error('[PLAYBACK] Play error:', err);
        showToast(`${t('playback_error', 'Playback error:')} ${err.message}`);
    });
    dom.trackName.innerText = displayTitle;
    dom.artistName.innerText = displayArtist;
    applyImgFallback(dom.mainCover, track.cover);
    dom.vinylContainer.classList.add('visible');
    
    // Update browser title and Media Session API
    document.title = `${displayTitle} - ${displayArtist} | UrZen`;
    if ('mediaSession' in navigator) {
        try {
            const metadata = {
                title: String(displayTitle || t('unknown_title', 'Unknown')),
                artist: String(displayArtist || t('unknown_artist', 'Unknown Artist')),
                album: String(displayAlbum || 'UrZen Player')
            };
            
            const coverUrl = resolveCover(track.cover);
            metadata.artwork = [
                { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
                { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
                { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
                { src: coverUrl, sizes: '256x256', type: 'image/jpeg' }
            ];
            console.log('[MEDIA SESSION] Artwork set with cover');
            
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
    logPlayHistory(track);
    if (track.source === 'navidrome' && track.navidromeId) {
        scrobbleNavidromeSong(track.navidromeId).catch(() => {});
    }
    updateHomeVisibility();
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

// Align shuffle position with a specific track id so prev/next follow history
function syncShufflePositionWithTrackId(trackId) {
    if (!state.shuffle) return;
    const view = getCurrentListView();
    if (view.length === 0) return;
    
    const id = String(trackId);
    const viewIndex = view.findIndex(t =>
        String(t.id || t.navidromeId) === id ||
        String(t.navidromeId) === id ||
        String(t.url || '') === id
    );
    if (viewIndex === -1) return;
    
    if (!Array.isArray(state.shuffledOrder) || state.shuffledOrder.length !== view.length) {
        generateShuffleOrder();
    }
    
    let pos = state.shuffledOrder.indexOf(viewIndex);
    if (pos === -1) {
        generateShuffleOrder();
        pos = state.shuffledOrder.indexOf(viewIndex);
    }
    
    if (pos !== -1) {
        state.shufflePosition = pos + 1;
        console.log('[SHUFFLE] Synced position to', state.shufflePosition, 'for index', viewIndex);
    }
}

window.syncShufflePositionWithTrackId = syncShufflePositionWithTrackId;

window.nextTrack = () => {
    const view = getCurrentListView();
    if (view.length === 0) return;

    if (state.repeat === 'one') {
        dom.audio.currentTime = 0;
        dom.audio.play();
        return;
    }

    let nextTrack;

    if (state.nextOverrideId) {
        const overrideId = String(state.nextOverrideId);
        state.nextOverrideId = null;
        
        nextTrack = view.find(t =>
            String(t.id || t.navidromeId) === overrideId ||
            String(t.navidromeId) === overrideId ||
            String(t.url || '') === overrideId
        );
        if (!nextTrack) {
            nextTrack = state.library.find(t =>
                String(t.id || t.navidromeId) === overrideId ||
                String(t.navidromeId) === overrideId ||
                String(t.url || '') === overrideId
            );
        }
        if (nextTrack && state.shuffle) {
            syncShufflePositionWithTrackId(overrideId);
        }
    }

    if (!nextTrack && state.shuffle) {
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
    } else if (!nextTrack) {
        // Обычное воспроизведение в порядке
        const currentTrack = state.library[state.currentIndex];
        const currentTrackId = currentTrack?.id || currentTrack?.navidromeId || currentTrack?.url;
        const idxInView = view.findIndex(t =>
            (t.id || t.navidromeId) === currentTrackId ||
            t.navidromeId === currentTrackId ||
            t.url === currentTrackId
        );

        if (idxInView < view.length - 1) {
            nextTrack = view[idxInView + 1];
        } else if (state.repeat === 'all') {
            nextTrack = view[0];
        } else {
            return;
        }
    }

    if (nextTrack.source === 'navidrome') {
        const nextId = nextTrack.navidromeId || nextTrack.url;
        window.playNavidromeSong(nextId, nextTrack.title, nextTrack.artist, nextTrack.album, nextTrack.cover);
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
        const currentTrackId = currentTrack?.id || currentTrack?.navidromeId || currentTrack?.url;
        const idxInView = view.findIndex(t =>
            (t.id || t.navidromeId) === currentTrackId ||
            t.navidromeId === currentTrackId ||
            t.url === currentTrackId
        );

        if (idxInView > 0) {
            prevTrack = view[idxInView - 1];
        } else if (state.repeat === 'all') {
            prevTrack = view[view.length - 1];
        } else {
            return;
        }
    }

    if (prevTrack.source === 'navidrome') {
        const prevId = prevTrack.navidromeId || prevTrack.url;
        window.playNavidromeSong(prevId, prevTrack.title, prevTrack.artist, prevTrack.album, prevTrack.cover);
    } else {
        window.playTrack(prevTrack.id);
    }
};

window.clearQueue = async () => {
    window.toggleModal('clearQueueModal');
};

window.confirmClearQueue = async () => {
    const successMsg = t('queue_cleared', 'Queue cleared');
    
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

window.togglePlayback = () => {
    if (state.currentIndex === -1 && state.library.length > 0) {
        const firstTrack = state.library[0];
        if (firstTrack.source === 'navidrome') {
            const firstId = firstTrack.navidromeId || firstTrack.url;
            window.playNavidromeSong(firstId, firstTrack.title, firstTrack.artist, firstTrack.album, firstTrack.cover);
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
        // Use localized placeholders
        searchInput.placeholder = state.isZen
            ? t('search_music_placeholder', 'Search Music...')
            : t('search_library_placeholder', 'Search library...');
    }
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Обработка переключения вкладок
    if (tab === 'home') {
        document.getElementById('nav-home')?.classList.add('active');
        document.getElementById('nav-home-mobile')?.classList.add('active');
        console.log('[TAB] Switched to Home');

        const navidromeContainer = document.getElementById('navidromeContainer');
        const aboutContainer = document.getElementById('aboutContainer');
        const mainContent = document.getElementById('mainContent');
        const rightPanel = document.querySelector('.right');
        const playerControls = document.getElementById('playerControls');
        const topSearch = document.getElementById('topSearch');
        const rightQueueShow = document.getElementById('rightQueueShowBtn');

        if (navidromeContainer) {
            navidromeContainer.style.display = 'none';
            navidromeContainer.classList.remove('music-tab-visible');
        }
        if (aboutContainer) aboutContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'flex';
        if (rightPanel) rightPanel.style.display = 'none';
        if (playerControls) playerControls.style.display = 'none';
        if (topSearch) topSearch.style.display = 'none';
        if (rightQueueShow) rightQueueShow.style.display = 'none';

        updateHomeVisibility(true);
        return;
    } else if (tab === 'all') {
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
        if (navidromeContainer) {
            navidromeContainer.style.display = 'none';
            navidromeContainer.classList.remove('music-tab-visible');
        }
        if (aboutContainer) aboutContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'flex';
        if (rightPanel) rightPanel.style.display = 'flex';
        if (playerControls) playerControls.style.display = 'flex';
        if (topSearch) topSearch.style.display = 'flex';
        const rightQueueShow = document.getElementById('rightQueueShowBtn');
        if (rightQueueShow) rightQueueShow.style.display = '';
        
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
        if (navidromeContainer) {
            navidromeContainer.style.display = 'none';
            navidromeContainer.classList.remove('music-tab-visible');
        }
        if (aboutContainer) aboutContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'flex';
        if (rightPanel) rightPanel.style.display = 'flex';
        if (playerControls) playerControls.style.display = 'flex';
        if (topSearch) topSearch.style.display = 'flex';
        const rightQueueShow = document.getElementById('rightQueueShowBtn');
        if (rightQueueShow) rightQueueShow.style.display = '';
        
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
        if (navidromeContainer) {
            navidromeContainer.style.display = 'flex';
            navidromeContainer.classList.remove('music-tab-visible');
            void navidromeContainer.offsetWidth;
            navidromeContainer.classList.add('music-tab-visible');
        }
        if (aboutContainer) aboutContainer.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';
        if (rightPanel) rightPanel.style.display = 'none';
        if (playerControls) playerControls.style.display = 'none';
        if (topSearch) topSearch.style.display = 'none';
        const rightQueueShow = document.getElementById('rightQueueShowBtn');
        if (rightQueueShow) rightQueueShow.style.display = 'none';
        
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
        if (navidromeContainer) {
            navidromeContainer.style.display = 'none';
            navidromeContainer.classList.remove('music-tab-visible');
        }
        if (mainContent) mainContent.style.display = 'none';
        if (rightPanel) rightPanel.style.display = 'none';
        if (playerControls) playerControls.style.display = 'none';
        if (topSearch) topSearch.style.display = 'none';
        const rightQueueShow = document.getElementById('rightQueueShowBtn');
        if (rightQueueShow) rightQueueShow.style.display = 'none';
        
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
        if (navidromeContainer) {
            navidromeContainer.style.display = 'none';
            navidromeContainer.classList.remove('music-tab-visible');
        }
        if (mainContent) mainContent.style.display = 'flex';
        if (rightPanel) rightPanel.style.display = 'flex';
        if (playerControls) playerControls.style.display = 'flex';
        if (topSearch) topSearch.style.display = 'flex';
        const rightQueueShow = document.getElementById('rightQueueShowBtn');
        if (rightQueueShow) rightQueueShow.style.display = '';
        
        renderLibrary();
        renderPlaylistNav();
    }
    updateHomeVisibility();
};

window.toggleShuffle = () => {
    state.shuffle = !state.shuffle;
    db.settings.put({key: 'shuffle', value: state.shuffle});
    localStorage.setItem('shuffle', state.shuffle);
    
    // Если shuffle включен, создать перемешанный порядок
    if (state.shuffle) {
        generateShuffleOrder();
        if (state.currentIndex !== -1) {
            const currentTrack = state.library[state.currentIndex];
            const currentId = currentTrack?.navidromeId || currentTrack?.id;
            if (currentId !== undefined) syncShufflePositionWithTrackId(currentId);
        }
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
        showToast(t('track_data_unavailable', 'Error: Track data not available'));
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
        showToast(t('track_data_unavailable', 'Error: Track data not available'));
        return;
    }
    
    if (source === 'navidrome') {
        // For Navidrome songs, save favorite to localStorage
        let navidromeFavs = JSON.parse(localStorage.getItem('navidromeFavorites') || '[]');
        const favIndex = navidromeFavs.findIndex(f => f.navidromeId === trackId || f.url === trackId);
        
        if (favIndex === -1) {
            const navUrl = track.url || (track.navidromeId && window.getNavidromeStreamUrl ? window.getNavidromeStreamUrl(track.navidromeId) : '');
            navidromeFavs.push({
                navidromeId: trackId,
                title: track.title,
                artist: track.artist,
                album: track.album,
                cover: track.cover,
                url: navUrl,
                source: 'navidrome'
            });
            showToast(t('fav_added', 'Added to favorites!'));
        } else {
            navidromeFavs.splice(favIndex, 1);
            showToast(t('fav_removed', 'Removed from favorites'));
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
    // 1) локальная библиотека
    let track = state.library.find(t => t.id === songId || t.navidromeId === songId || t.url === songId);

    // 2) временное хранилище (Navidrome результаты поиска)
    if (!track && source === 'navidrome' && window.tempPendingTrack) {
        track = window.tempPendingTrack;
        console.log('[PLAYLIST PICKER] Using temp track from search:', track);
    }

    // 3) Navidrome вкладка: берём из загруженного списка, если ещё не нашли
    if (!track && source === 'navidrome' && Array.isArray(state.navidromeSongs)) {
        track = state.navidromeSongs.find(t => t.navidromeId === songId || t.id === songId || t.url === songId);
        if (track) {
            // гарантируем наличие navidromeId
            if (!track.navidromeId) track.navidromeId = track.id;
            track.source = 'navidrome';
            console.log('[PLAYLIST PICKER] Resolved track from navidromeSongs cache:', track);
        }
    }

    state.playlists.forEach(pl => {
        const id = pl.id;
        // Для Navidrome песен проверяем по navidromeId
        const isIncluded = Array.isArray(pl.songIds) && (
            pl.songIds.includes(songId) || 
            (track && pl.navidromeSongIds && pl.navidromeSongIds.includes(track.navidromeId)) ||
            (track && (pl.navidromeSongs || []).some(s => s.url && track.url && s.url === track.url))
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
            const trackUrl = track?.url || (track?.navidromeId && window.getNavidromeStreamUrl ? window.getNavidromeStreamUrl(track.navidromeId) : '');
            const isNavCurrentlyIncluded = track && (
                (track.navidromeId && playlist.navidromeSongIds.includes(track.navidromeId)) ||
                (trackUrl && (playlist.navidromeSongs || []).some(s => s.url === trackUrl))
            );
            
            if (source === 'navidrome' && track) {
                if (!isNavCurrentlyIncluded) {
                    const navUrl = track.url || (window.getNavidromeStreamUrl ? window.getNavidromeStreamUrl(track.navidromeId) : '');
                    if (track.navidromeId) playlist.navidromeSongIds.push(track.navidromeId);
                    // Сохраняем полный объект песни для надёжности
                    playlist.navidromeSongs.push({
                        navidromeId: track.navidromeId,
                        title: track.title,
                        artist: track.artist,
                        album: track.album,
                        cover: track.cover,
                        url: navUrl,
                        source: 'navidrome'
                    });
                    
                    // Sync with server if authenticated
                    if (isUserAuthenticated()) {
                        try {
                            const { addTrackToServerPlaylist, fetchServerPlaylists } = await import('./modules/server-playlist-manager.js');
                            let serverId = playlist.serverId;
                            if (!serverId) {
                                const serverPlaylists = await fetchServerPlaylists();
                                const match = serverPlaylists.find(p => p.name === playlist.name);
                                serverId = match?.id;
                                if (serverId) {
                                    await db.playlists.update(id, { serverId });
                                }
                            }
                            const trackData = {
                                track_title: track.title,
                                track_artist: track.artist,
                                track_album: track.album,
                                track_duration: track.duration,
                                track_source: 'navidrome',
                                navidrome_id: track.navidromeId,
                                cover_art_id: track.coverArtId || track.cover,
                                track_url: track.url || (window.getNavidromeStreamUrl ? window.getNavidromeStreamUrl(track.navidromeId) : null)
                            };
                            if (serverId) {
                                await addTrackToServerPlaylist(serverId, trackData);
                                console.log('[SYNC] Added track to server playlist');
                            }
                        } catch (error) {
                            console.error('[SYNC] Failed to add track to server playlist:', error);
                        }
                    }
                } else {
                    playlist.navidromeSongIds = playlist.navidromeSongIds.filter(s => s !== track.navidromeId);
                    playlist.navidromeSongs = playlist.navidromeSongs.filter(s => s.navidromeId !== track.navidromeId && s.url !== trackUrl);
                    
                    if (isUserAuthenticated()) {
                        try {
                            const { fetchServerPlaylists, fetchServerPlaylistDetails, removeTrackFromServerPlaylist } = await import('./modules/server-playlist-manager.js');
                            let serverId = playlist.serverId;
                            if (!serverId) {
                                const serverPlaylists = await fetchServerPlaylists();
                                const match = serverPlaylists.find(p => p.name === playlist.name);
                                serverId = match?.id;
                                if (serverId) {
                                    await db.playlists.update(id, { serverId });
                                }
                            }
                            if (serverId) {
                                const details = await fetchServerPlaylistDetails(serverId);
                                const serverTrack = details?.tracks?.find(t =>
                                    t.navidrome_id === track.navidromeId ||
                                    t.track_url === trackUrl
                                );
                                if (serverTrack?.id) {
                                    await removeTrackFromServerPlaylist(serverId, serverTrack.id);
                                    console.log('[SYNC] Removed track from server playlist');
                                }
                            }
                        } catch (error) {
                            console.error('[SYNC] Failed to remove track from server playlist:', error);
                        }
                    }
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
    btnClose.innerText = t('done', 'Done');
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
    if (source === 'navidrome' && isUserAuthenticated()) {
        try {
            const { fetchServerPlaylists, fetchServerPlaylistDetails, removeTrackFromServerPlaylist } = await import('./modules/server-playlist-manager.js');
            const playlist = state.playlists.find(p => p.id === playlistId);
            let serverId = playlist?.serverId;
            if (!serverId && playlist?.name) {
                const serverPlaylists = await fetchServerPlaylists();
                const match = serverPlaylists.find(p => p.name === playlist.name);
                serverId = match?.id;
                if (serverId) {
                    await db.playlists.update(playlistId, { serverId });
                }
            }
            if (serverId) {
                const details = await fetchServerPlaylistDetails(serverId);
                const serverTrack = details?.tracks?.find(t =>
                    t.navidrome_id === songId ||
                    t.navidrome_id === Number(songId) ||
                    t.track_url === songId
                );
                if (serverTrack?.id) {
                    await removeTrackFromServerPlaylist(serverId, serverTrack.id);
                }
            }
        } catch (error) {
            console.error('[SYNC] Failed to remove track from server playlist:', error);
        }
    }
    showToast(t('removed', 'Removed'));
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
                const template = t('added_to_playlist', 'Added {count} track(s) to {playlist}');
                showToast(template.replace('{count}', count).replace('{playlist}', pl.name));
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
        btnCancel.innerText = t('cancel', 'Cancel');
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
                resolve({ title: title || file.name.replace(/\.[^/.]+$/, ""), artist: artist || t('unknown_artist', 'Unknown Artist'), cover: coverUrl });
            },
            onError: () => resolve({ title: file.name.replace(/\.[^/.]+$/, ""), artist: t('unknown_artist', 'Unknown Artist'), cover: null })
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
    showToast(t('files_imported', 'Files imported successfully!'));
    
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
    if (!state.performanceMode) startVisualizer();
}

function initVisualizer() {
    const c = document.getElementById('visualizerCanvas');
    c.width = window.innerWidth;
    c.height = state.isZen ? window.innerHeight * 0.6 : window.innerHeight * 0.4;
}

function getAccentRgb() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
    const parts = raw.split(',').map((val) => Number.parseInt(val.trim(), 10)).filter((num) => Number.isFinite(num));
    if (parts.length >= 3) {
        return { r: parts[0], g: parts[1], b: parts[2] };
    }
    return { r: 255, g: 62, b: 0 };
}

function updateVisualizerPalette() {
    state.visualizerTheme = document.documentElement.getAttribute('data-theme') || 'classic';
    state.visualizerRgb = getAccentRgb();
}

function startVisualizer() {
    if (state.performanceMode) return;
    if (!state.analyser || state.visualizerRunning) return;
    const c = document.getElementById('visualizerCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    updateVisualizerPalette();
    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    function draw() {
        if (state.performanceMode || !state.visualizerRunning) {
            state.visualizerRunning = false;
            return;
        }
        state.visualizerFrameId = requestAnimationFrame(draw);
        state.analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, c.width, c.height);
        const barWidth = (c.width / bufferLength) * 2.5;
        let x = 0;
        const themeId = document.documentElement.getAttribute('data-theme') || 'classic';
        if (!state.visualizerRgb || state.visualizerTheme !== themeId) {
            updateVisualizerPalette();
        }
        const { r, g, b } = state.visualizerRgb || { r: 255, g: 62, b: 0 };
        for(let i = 0; i < bufferLength; i++) {
            let barHeight = dataArray[i] * (state.isZen ? 1.8 : 1.2);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${barHeight/255})`;
            ctx.fillRect(x, c.height - barHeight, barWidth, barHeight);
            x += barWidth + 2;
        }
    }
    state.visualizerRunning = true;
    draw();
}

function stopVisualizer() {
    if (state.visualizerFrameId) {
        cancelAnimationFrame(state.visualizerFrameId);
        state.visualizerFrameId = null;
    }
    state.visualizerRunning = false;
    const c = document.getElementById('visualizerCanvas');
    if (c) {
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
    }
}

// ============ СОБЫТИЯ АУДИО ============
function initAudioEvents() {
    dom.audio.onplay = () => { 
        state.isPlaying = true; 
        document.body.classList.add('playing'); 
        updatePlayIcon(true);
        if (state.currentTab === 'home') updateHomeVisibility();
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
    };
    dom.audio.onpause = () => { 
        state.isPlaying = false; 
        document.body.classList.remove('playing'); 
        updatePlayIcon(false);
        if (state.currentTab === 'home') updateHomeVisibility();
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

    dom.audio.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - lastProgressSave < PLAY_PROGRESS_THROTTLE) return;
        lastProgressSave = now;
        const currentTrack = state.library[state.currentIndex];
        if (currentTrack) {
            savePlaybackProgress(currentTrack, dom.audio.currentTime, dom.audio.duration);
        }
    });

    dom.audio.addEventListener('ended', () => {
        const currentTrack = state.library[state.currentIndex];
        if (currentTrack) {
            clearPlaybackProgress(currentTrack);
        }
        if (state.currentTab === 'home') updateHomeVisibility();
    });
}

function updatePlayIcon(playing) {
    const iconName = playing ? 'pause' : 'play';
    const mainBtn = dom.playBtn || document.getElementById('btnPlay');
    if (mainBtn) {
        mainBtn.innerHTML = `<i data-lucide="${iconName}" id="playIconUI" size="28"></i>`;
    }
    const mobileBtn = document.getElementById('mobilePlayBtn');
    if (mobileBtn) {
        mobileBtn.innerHTML = `<i data-lucide="${iconName}" id="mobilePlayIcon"></i>`;
    }
    dom.playIcon = document.getElementById('playIconUI');
    refreshIcons();
}

function updateVolumeUI() { dom.volFill.style.width = (dom.audio.volume * 100) + "%"; }

// ============ ZEN MODE ============
window.toggleZen = (enable) => {
    state.isZen = enable;
    document.body.classList.toggle('zen-active', enable);
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
            globalSearch.placeholder = t('search_music_placeholder', 'Search Music...');
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
                    zenSearchResults.innerHTML = `<div class="zen-search-empty">${t('search_error', 'Search error')}</div>`;
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
            globalSearch.placeholder = t('search_library_placeholder', 'Search library...');
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
        container.innerHTML = `<div class="zen-search-empty">${t('no_results_found', 'No results found')}</div>`;
        return;
    }
    
    container.innerHTML = results.map(track => {
        const source = track.source || 'local';
        const trackId = source === 'navidrome'
            ? (track.navidromeId || track.id || track.url)
            : track.id;
        const safeTitle = (track.title || t('unknown_title', 'Unknown')).replace(/'/g, "\\'");
        const safeArtist = (track.artist || t('unknown_artist', 'Unknown Artist')).replace(/'/g, "\\'");
        const safeAlbum = (track.album || '').replace(/'/g, "\\'");
        const safeCover = (resolveCover(track.cover) || '').replace(/'/g, "\\'");
        
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
                <div class="zen-result-title">${track.title || t('unknown_title', 'Unknown')}</div>
                <div class="zen-result-artist">${track.artist || t('unknown_artist', 'Unknown Artist')}</div>
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
    window.toggleModal('wipeDataModal');
};

window.confirmWipeData = async () => {
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
    showToast(t('database_cleared', 'Database cleared'));
    window.toggleModal('wipeDataModal');
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
    setLoaderMsg(t('loading_status', 'Loading...'));

    // Step 1: Initialize DOM
    try {
        initDOM();
        initRightQueueResizer();
        if (dom.mainCover) {
            dom.mainCover.onerror = () => {
                dom.mainCover.src = DEFAULT_COVER;
            };
        }
        console.log('[APP] DOM initialized');
    } catch (err) {
        console.error('[APP] DOM init failed:', err);
        setLoaderMsg(t('error_dom_init', 'Error: DOM initialization failed'));
        setTimeout(() => { if(dom.loader) dom.loader.classList.add('hidden'); }, 5000);
        return;
    }

    // Step 2: Check Dexie
    if (typeof Dexie === 'undefined') {
        console.error('[APP] Dexie not loaded');
        setLoaderMsg(t('error_dexie_missing', 'Error: Dexie library missing'));
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
                updateHomeVisibility();
                
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
        setLoaderMsg(t('ready_status', 'Ready!'));
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
            if (isUserAuthenticated()) {
                await syncPlaylistsWithServer(state.playlists, db);
                await loadPlaylistsFromDB();
            }
        } catch (err) {
            console.warn('[APP] Playlists load failed:', err);
            state.playlists = [];
        }
        // Ensure currentTab is set and switchTab is called
        state.currentTab = 'home';
        localStorage.setItem('currentTab', JSON.stringify('home'));
        window.switchTab(state.currentTab);
        updateHomeVisibility(true);
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
        if (mobileTrack) mobileTrack.innerText = track.title || t('unknown_title', 'Unknown');
        if (mobileArtist) mobileArtist.innerText = track.artist || t('unknown_artist', 'Unknown Artist');
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
