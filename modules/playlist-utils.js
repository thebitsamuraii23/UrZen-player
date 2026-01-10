// Lightweight glue file for playlist utilities.
// Attaches a `playlistUtils` object to `window` that points to the inline functions
// defined in `player-standalone.html` (the file keeps working standalone).

(function(){
  const api = {
    openPicker: (songId) => { if (window.openPlaylistPickerMulti) return window.openPlaylistPickerMulti(songId); },
    removeFromPlaylist: (playlistId, songId) => { if (window.removeSongFromPlaylist) return window.removeSongFromPlaylist(playlistId, songId); }
  };
  window.playlistUtils = api;
})();
