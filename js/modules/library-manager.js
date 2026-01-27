// Модуль для управления библиотекой песен
import { state, dom } from '../state.js';

/**
 * Вспомогательная функция для генерации URL stream
 */
function buildNavidromeStreamUrl(songId) {
    const NAVIDROME_URL = 'https://music.youtubemusicdownloader.life';
    const NAVIDROME_USER = 'guest';
    const NAVIDROME_PASS = 'guest';
    const API_VERSION = '1.16.1';
    const APP_NAME = 'Z-Testing';
    
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
            // Если это локальная песня с fileBlob
            if (s.fileBlob) {
                try {
                    return { 
                        ...s, 
                        url: URL.createObjectURL(s.fileBlob),
                        source: 'local'
                    };
                } catch (err) {
                    console.warn('[LIBRARY] Failed to create URL for:', s.title, err);
                    return null;
                }
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

export function getCurrentListView() {
    let list = state.library;
    if (state.currentTab === 'fav') {
        list = state.library.filter(t => t.isFavorite);
    }
    else if (typeof state.currentTab === 'number') {
        const pl = state.playlists.find(p => p.id === state.currentTab);
        console.log('[PLAYLIST VIEW] Getting list for playlist id:', state.currentTab, 'playlist:', pl);
        if (pl) {
            console.log('[PLAYLIST VIEW] songIds:', pl.songIds, 'navidromeSongs count:', pl.navidromeSongs?.length || 0);
            // Объединяем локальные и Navidrome песни из плейлиста
            // Нормализуем songIds - сравниваем оба как Numbers
            const normalizedSongIds = (pl.songIds || []).map(id => Number(id));
            const localSongs = state.library.filter(t => {
                const trackId = Number(t.id);
                return normalizedSongIds.includes(trackId);
            });
            console.log('[PLAYLIST VIEW] Found local songs:', localSongs.length);
            // Используем сохранённые в БД Navidrome песни
            const navidromeSongs = pl.navidromeSongs || [];
            list = [...localSongs, ...navidromeSongs];
            console.log('[PLAYLIST VIEW] Final list size:', list.length);
        }
    }
    // Apply search filter if present
    if (state.searchQuery && state.searchQuery.trim().length > 0) {
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
        libraryIds: state.library.map(s => ({
            id: s.id,
            navidromeId: s.navidromeId,
            source: s.source
        })),
        currentIndex: state.currentIndex
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
        if (queueState.currentIndex !== undefined) {
            state.currentIndex = queueState.currentIndex;
        }
        console.log('[LIBRARY] Queue state restored, currentIndex:', state.currentIndex);
    } catch (err) {
        console.warn('[LIBRARY] Failed to restore queue state:', err);
    }
}
