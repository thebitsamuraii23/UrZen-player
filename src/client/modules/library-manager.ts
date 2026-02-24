// @ts-nocheck
// Модуль для управления библиотекой песен
import { state, dom } from '../state.ts';

/**
 * Вспомогательная функция для генерации URL stream
 */
function buildNavidromeStreamUrl(songId) {
    const NAVIDROME_URL = 'https://music.youtubemusicdownloader.life';
    const NAVIDROME_USER = 'guest';
    const NAVIDROME_PASS = 'guest';
    const API_VERSION = '1.16.1';
    const APP_NAME = 'UrZen';
    
    const baseParams = {
        u: NAVIDROME_USER,
        p: NAVIDROME_PASS,
        v: API_VERSION,
        c: APP_NAME,
        f: 'json'
    };
    
    const allParams = { ...baseParams, id: songId };
    const queryString = new URLSearchParams(allParams).toString();
    return `${NAVIDROME_URL}/rest/stream.view?${queryString}`;
}

export async function loadLibraryFromDB() {
    const saved = await window.db.songs.toArray();
    saved.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    console.log('[LIBRARY] Loaded', saved.length, 'total songs from DB');
    
    // Очищаем старые Object URLs от локальных песен
    state.library.forEach(s => {
        if (s.url && typeof s.url === 'string' && s.url.startsWith('blob:')) {
            try {
                URL.revokeObjectURL(s.url);
            } catch (err) {}
        }
    });
    
    // Загружаем ВСЕ песни: локальные и Navidrome
    const allSongs = saved
        .map(s => {
            // Локальная песня: либо хранится как Blob, либо уже синхронизирована и имеет remoteUrl
            if (s.source !== 'navidrome') {
                let playbackUrl = '';
                if (s.fileBlob) {
                    try {
                        playbackUrl = URL.createObjectURL(s.fileBlob);
                    } catch (err) {
                        console.warn('[LIBRARY] Failed to create blob URL for:', s.title, err);
                    }
                }
                if (!playbackUrl && s.remoteUrl) {
                    playbackUrl = s.remoteUrl;
                }
                if (!playbackUrl && s.url && typeof s.url === 'string' && /^https?:\/\//i.test(s.url)) {
                    playbackUrl = s.url;
                }
                if (!playbackUrl && s.url && typeof s.url === 'string' && s.url.startsWith('/api/user/local-tracks/')) {
                    playbackUrl = s.url;
                }
                if (playbackUrl && typeof playbackUrl === 'string' && playbackUrl.includes('/api/user/local-tracks/')) {
                    const token = localStorage.getItem('auth_token');
                    if (token && !playbackUrl.includes('token=')) {
                        const joiner = playbackUrl.includes('?') ? '&' : '?';
                        playbackUrl = `${playbackUrl}${joiner}token=${encodeURIComponent(token)}`;
                    }
                }
                if (!playbackUrl) {
                    return null;
                }
                return {
                    ...s,
                    url: playbackUrl,
                    source: 'local'
                };
            }
            // Если это Navidrome песня
            else if (s.source === 'navidrome' && s.navidromeId) {
                // Генерируем URL для воспроизведения, если его нет
                let url = s.url;
                if (!url) {
                    // Генерируем URL на лету из navidromeId
                    console.log('[LIBRARY] Generating stream URL for Navidrome ID:', s.navidromeId);
                    const streamUrl = window.getNavidromeStreamUrl ? 
                        window.getNavidromeStreamUrl(s.navidromeId) : 
                        buildNavidromeStreamUrl(s.navidromeId);
                    url = streamUrl;
                    console.log('[LIBRARY] Generated stream URL:', url);
                }
                
                return {
                    id: s.id,
                    title: s.title,
                    artist: s.artist,
                    albumId: s.albumId || '',
                    album: s.album,
                    duration: s.duration || 0,
                    cover: s.cover,
                    url: url,
                    source: 'navidrome',
                    navidromeId: s.navidromeId,
                    isFavorite: s.isFavorite || false,
                    order: s.order
                };
            }
            return null;
        })
        .filter(s => s !== null); // Удаляем ошибочные записи
    
    state.library = allSongs;
    
    console.log('[LIBRARY] Loaded songs: local=' + allSongs.filter(s => s.source === 'local').length + ', navidrome=' + allSongs.filter(s => s.source === 'navidrome').length);
    if (window.renderLibrary) window.renderLibrary();
}

function getPlaylistOrderKeyFromTrack(track) {
    if (!track) return '';
    if (track.source === 'navidrome') {
        let key = String(track.navidromeId || track.id || track.url || '').trim();
        if (!track.navidromeId && /^https?:\/\//i.test(key)) {
            try {
                const parsed = new URL(key);
                parsed.searchParams.delete('f');
                key = parsed.toString();
            } catch (e) {}
        }
        return key ? `navidrome:${key}` : '';
    }
    const localId = Number(track.id);
    return Number.isFinite(localId) ? `local:${localId}` : '';
}

function normalizePlaylistOrderEntry(entry) {
    if (typeof entry === 'string') {
        return entry.trim();
    }
    if (!entry || typeof entry !== 'object') return '';
    const source = entry.source === 'navidrome' ? 'navidrome' : 'local';
    if (source === 'navidrome') {
        let key = String(entry.navidromeId || entry.id || entry.url || '').trim();
        if (!entry.navidromeId && /^https?:\/\//i.test(key)) {
            try {
                const parsed = new URL(key);
                parsed.searchParams.delete('f');
                key = parsed.toString();
            } catch (e) {}
        }
        return key ? `navidrome:${key}` : '';
    }
    const localId = Number(entry.id);
    return Number.isFinite(localId) ? `local:${localId}` : '';
}

function takePlaylistTrackByKey(map, key) {
    const list = map.get(key);
    if (!Array.isArray(list) || !list.length) return null;
    const track = list.shift() || null;
    if (!list.length) map.delete(key);
    return track;
}

function getOrderedPlaylistTracks(playlist) {
    if (!playlist) return [];

    const localById = new Map();
    state.library.forEach((track) => {
        const trackId = Number(track.id);
        if (!Number.isNaN(trackId)) localById.set(trackId, track);
    });
    const localSongs = (playlist.songIds || [])
        .map((id) => localById.get(Number(id)))
        .filter(Boolean);
    const navidromeSongs = Array.isArray(playlist.navidromeSongs)
        ? playlist.navidromeSongs.map((track) => ({ ...track, source: 'navidrome' }))
        : [];

    const localByKey = new Map();
    localSongs.forEach((track) => {
        const key = getPlaylistOrderKeyFromTrack(track);
        if (!key) return;
        const list = localByKey.get(key) || [];
        list.push(track);
        localByKey.set(key, list);
    });

    const navByKey = new Map();
    navidromeSongs.forEach((track) => {
        const key = getPlaylistOrderKeyFromTrack(track);
        if (!key) return;
        const list = navByKey.get(key) || [];
        list.push(track);
        navByKey.set(key, list);
    });

    const ordered = [];
    const consumed = new Set();
    const trackOrder = Array.isArray(playlist.trackOrder) ? playlist.trackOrder : [];
    trackOrder.forEach((entry) => {
        const key = normalizePlaylistOrderEntry(entry);
        if (!key) return;
        let track = takePlaylistTrackByKey(localByKey, key);
        if (!track) track = takePlaylistTrackByKey(navByKey, key);
        if (!track || consumed.has(track)) return;
        consumed.add(track);
        ordered.push(track);
    });

    localSongs.forEach((track) => {
        if (consumed.has(track)) return;
        consumed.add(track);
        ordered.push(track);
    });
    navidromeSongs.forEach((track) => {
        if (consumed.has(track)) return;
        consumed.add(track);
        ordered.push(track);
    });

    return ordered;
}

export function getCurrentListView(tabOverride = state.currentTab, applySearch = true) {
    let list = state.library;
    if (tabOverride === 'fav') {
        list = state.library.filter(t => t.isFavorite);
    }
    else if (tabOverride === 'home-album') {
        list = Array.isArray(state.homeAlbumSongs) ? state.homeAlbumSongs : [];
    }
    else if (tabOverride === 'home-artist') {
        list = Array.isArray(state.homeArtistSongs) ? state.homeArtistSongs : [];
    }
    else if (typeof tabOverride === 'number') {
        const pl = state.playlists.find(p => p.id === tabOverride);
        console.log('[PLAYLIST VIEW] Getting list for playlist id:', tabOverride, 'playlist:', pl);
        if (pl) {
            console.log('[PLAYLIST VIEW] songIds:', pl.songIds, 'navidromeSongs count:', pl.navidromeSongs?.length || 0);
            list = getOrderedPlaylistTracks(pl);
            console.log('[PLAYLIST VIEW] Final list size:', list.length);
        }
    }
    // Apply search filter if present
    if (applySearch && state.searchQuery && state.searchQuery.trim().length > 0) {
        const q = state.searchQuery.toLowerCase();
        list = list.filter(t => (t.title || '').toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q));
    }
    return list;
}

export async function addSongToFavorites(trackId) {
    const track = state.library.find(t => t.id === trackId);
    if (track) {
        track.isFavorite = !track.isFavorite;
        await window.db.songs.update(trackId, { isFavorite: track.isFavorite });
        console.log('[LIBRARY] Toggle favorite:', trackId, '- isFavorite:', track.isFavorite);
    }
}

export async function deleteTrack(id, source = 'local') {
    const currentTrack = state.currentIndex !== -1 ? state.library[state.currentIndex] : null;
    const isCurrentTrack = currentTrack && (currentTrack.id === id || currentTrack.navidromeId === id);
    
    if (isCurrentTrack) {
        dom.audio.pause();
        state.currentIndex = -1;
        if (window.resetUI) window.resetUI();
    }
    
    // Only delete if it's a local song or we're in a playlist view
    if (source === 'local') {
        // Delete local imported song from library and database
        state.library = state.library.filter(t => t.id !== id);
        await window.db.songs.delete(id);
    } else if (source === 'navidrome') {
        // For Navidrome songs: only remove from current playlist view
        // Don't delete from library - Navidrome songs are temporary and tied to playlists
        if (typeof state.currentTab === 'number') {
            // We're in a playlist view, remove from that playlist
            const playlist = await window.db.playlists.get(state.currentTab);
            if (playlist) {
                playlist.navidromeSongIds = Array.isArray(playlist.navidromeSongIds) ? 
                    playlist.navidromeSongIds.filter(songId => songId !== id) : [];
                playlist.navidromeSongs = Array.isArray(playlist.navidromeSongs) ? 
                    playlist.navidromeSongs.filter(s => s.navidromeId !== id) : [];
                await window.db.playlists.update(state.currentTab, { 
                    navidromeSongIds: playlist.navidromeSongIds,
                    navidromeSongs: playlist.navidromeSongs
                });
            }
        }
        // Remove from current view (but keep in state.library for other views)
    }
    
    if (window.renderLibrary) window.renderLibrary();
    if (window.renderSidebarQueue) window.renderSidebarQueue();
}

// Сохраняет состояние очереди в localStorage
export function saveQueueState() {
    const queueState = {
        libraryIds: state.library.map(s => {
            const derivedUrl = s.url || (s.source === 'navidrome' && s.navidromeId && window.getNavidromeStreamUrl ? window.getNavidromeStreamUrl(s.navidromeId) : '');
            return {
                id: s.id,
                navidromeId: s.navidromeId,
                source: s.source,
                title: s.title,
                artist: s.artist,
                album: s.album,
                albumId: s.albumId || '',
                duration: s.duration,
                cover: s.cover,
                url: derivedUrl || s.url
            };
        }),
        currentIndex: state.currentIndex,
        playbackTab: state.playbackTab,
        smartShuffleQueueIds: Array.isArray(state.smartShuffleQueueIds) ? state.smartShuffleQueueIds.slice(0, 400) : [],
        nextOverrideQueueIds: Array.isArray(state.nextOverrideQueueIds) ? state.nextOverrideQueueIds.slice(0, 200) : []
    };
    localStorage.setItem('queueState', JSON.stringify(queueState));
    console.log('[LIBRARY] Queue state saved');
}

// Восстанавливает состояние очереди из localStorage
export async function restoreQueueState() {
    const saved = localStorage.getItem('queueState');
    if (!saved) return;
    
    try {
        const queueState = JSON.parse(saved);
        if (Array.isArray(queueState.libraryIds) && queueState.libraryIds.length > 0) {
            const byId = new Map();
            const byNavId = new Map();
            const byUrl = new Map();
            state.library.forEach(t => {
                if (t.id !== undefined && t.id !== null) byId.set(String(t.id), t);
                if (t.navidromeId) byNavId.set(String(t.navidromeId), t);
                if (t.url) byUrl.set(String(t.url), t);
            });
            
            const newLibrary = [];
            const pendingNavidromeSaves = [];
            const usedKeys = new Set();
            
            queueState.libraryIds.forEach(entry => {
                let item = null;
                let shouldPersistNavidrome = false;
                if (entry.source === 'navidrome') {
                    let entryUrl = entry.url || entry.trackUrl || '';
                    if (entryUrl && entryUrl.includes('/rest/stream.view') && entryUrl.includes('f=json')) {
                        try {
                            const parsed = new URL(entryUrl);
                            parsed.searchParams.delete('f');
                            entryUrl = parsed.toString();
                        } catch (e) {}
                    }
                    const navId = entry.navidromeId || entry.id;
                    if (entryUrl) {
                        item = byUrl.get(String(entryUrl));
                    }
                    if (!item && navId) {
                        item = byNavId.get(String(navId)) || byId.get(String(navId));
                    }
                    if (!item && (navId || entryUrl)) {
                        const resolvedUrl = entryUrl || (window.getNavidromeStreamUrl && navId ? window.getNavidromeStreamUrl(navId) : '');
                        item = {
                            id: entry.id || navId,
                            navidromeId: navId,
                            title: entry.title || '',
                            artist: entry.artist || '',
                            albumId: entry.albumId || '',
                            album: entry.album || '',
                            duration: entry.duration || 0,
                            cover: entry.cover || '',
                            source: 'navidrome',
                            url: resolvedUrl
                        };
                        shouldPersistNavidrome = true;
                    }
                } else if (entry.id !== undefined && entry.id !== null) {
                    item = byId.get(String(entry.id));
                }
                
                if (item) {
                    const key = String(item.url || item.navidromeId || item.id);
                    if (!usedKeys.has(key)) {
                        usedKeys.add(key);
                        newLibrary.push(item);
                        if (shouldPersistNavidrome) {
                            pendingNavidromeSaves.push(item);
                        }
                    }
                }
            });
            
            state.library.forEach(t => {
                const key = String(t.url || t.navidromeId || t.id);
                if (!usedKeys.has(key)) {
                    usedKeys.add(key);
                    newLibrary.push(t);
                }
            });
            
            state.library = newLibrary;

            if (pendingNavidromeSaves.length > 0 && window.db?.songs) {
                for (const track of pendingNavidromeSaves) {
                    try {
                        const exists = await window.db.songs.filter(s =>
                            (track.navidromeId && s.navidromeId === track.navidromeId) ||
                            (track.url && s.url === track.url)
                        ).first();
                        if (!exists) {
                            await window.db.songs.add({
                                title: track.title || '',
                                artist: track.artist || '',
                                albumId: track.albumId || '',
                                album: track.album || '',
                                duration: track.duration || 0,
                                url: track.url || '',
                                cover: track.cover || '',
                                source: 'navidrome',
                                navidromeId: track.navidromeId,
                                isFavorite: false,
                                order: 999999 + Math.random()
                            });
                        }
                    } catch (e) {
                        console.warn('[LIBRARY] Failed to persist Navidrome track:', e);
                    }
                }
            }
        }
        if (queueState.currentIndex !== undefined) {
            state.currentIndex = queueState.currentIndex;
            if (state.currentIndex >= state.library.length) state.currentIndex = -1;
        }
        if (queueState.playbackTab !== undefined) {
            state.playbackTab = queueState.playbackTab;
        }
        state.smartShuffleQueueIds = Array.isArray(queueState.smartShuffleQueueIds)
            ? queueState.smartShuffleQueueIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        state.nextOverrideQueueIds = Array.isArray(queueState.nextOverrideQueueIds)
            ? queueState.nextOverrideQueueIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        if (!state.nextOverrideQueueIds.length && queueState.nextOverrideId) {
            state.nextOverrideQueueIds = [String(queueState.nextOverrideId).trim()].filter(Boolean);
        }
        state.nextOverrideId = state.nextOverrideQueueIds[0] || null;
        state.queueReturnAnchorId = null;
        console.log('[LIBRARY] Queue state restored, currentIndex:', state.currentIndex);
    } catch (err) {
        console.warn('[LIBRARY] Failed to restore queue state:', err);
    }
}
