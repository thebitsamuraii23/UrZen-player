// Модуль для управления плейлистами
import { state, dom } from '../state.js';

export async function addSongToPlaylist(playlistId, songId, track, source = 'local') {
    const playlist = await window.db.playlists.get(playlistId);
    if (!playlist) return;
    
    playlist.songIds = Array.isArray(playlist.songIds) ? playlist.songIds : [];
    playlist.navidromeSongIds = Array.isArray(playlist.navidromeSongIds) ? playlist.navidromeSongIds : [];
    playlist.navidromeSongs = Array.isArray(playlist.navidromeSongs) ? playlist.navidromeSongs : [];
    
    const isCurrentlyIncluded = playlist.songIds.includes(songId);
    const isNavCurrentlyIncluded = track && track.navidromeId && playlist.navidromeSongIds.includes(track.navidromeId);
    
    if (source === 'navidrome' && track) {
        if (!isNavCurrentlyIncluded) {
            playlist.navidromeSongIds.push(track.navidromeId);
            playlist.navidromeSongs.push({
                navidromeId: track.navidromeId,
                title: track.title,
                artist: track.artist,
                album: track.album,
                cover: track.cover,
                source: 'navidrome'
            });
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
    
    await window.db.playlists.update(playlistId, { 
        songIds: playlist.songIds,
        navidromeSongIds: playlist.navidromeSongIds,
        navidromeSongs: playlist.navidromeSongs
    });
    console.log('[PLAYLIST] Updated playlist', playlistId, '- navidromeSongs:', playlist.navidromeSongs?.length || 0);
}

export async function removeSongFromPlaylist(playlistId, songId, source = 'local') {
    const pl = await window.db.playlists.get(playlistId);
    if (!pl) return;
    
    if (source === 'navidrome') {
        pl.navidromeSongIds = Array.isArray(pl.navidromeSongIds) ? pl.navidromeSongIds.filter(id => id !== songId) : [];
        pl.navidromeSongs = Array.isArray(pl.navidromeSongs) ? pl.navidromeSongs.filter(s => s.navidromeId !== songId) : [];
    } else {
        pl.songIds = Array.isArray(pl.songIds) ? pl.songIds.filter(id => id !== songId) : [];
    }
    
    await window.db.playlists.update(playlistId, { 
        songIds: pl.songIds,
        navidromeSongIds: pl.navidromeSongIds,
        navidromeSongs: pl.navidromeSongs
    });
    console.log('[PLAYLIST] Removed song from playlist', playlistId);
}

export async function createPlaylist(name) {
    await window.db.playlists.add({ 
        name, 
        songIds: [],
        navidromeSongIds: [],
        navidromeSongs: []
    });
    console.log('[PLAYLIST] Created new playlist:', name);
}

export async function deletePlaylist(playlistId) {
    await window.db.playlists.delete(playlistId);
    console.log('[PLAYLIST] Deleted playlist:', playlistId);
}

export async function renamePlaylist(playlistId, newName) {
    await window.db.playlists.update(playlistId, { name: newName });
    console.log('[PLAYLIST] Renamed playlist:', playlistId, 'to', newName);
}
