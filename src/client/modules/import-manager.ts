// @ts-nocheck
// Модуль для импорта музыки
import { state, dom } from '../state.ts';
import { loadLibraryFromDB } from './library-manager.ts';

export async function handleFileImport(files) {
    if (files.length === 0) return;
    console.log('[IMPORT] Files selected:', files.length);
    dom.loader.classList.remove('hidden');
    const currentCount = await window.db.songs.count();
    console.log('[IMPORT] Current count in DB:', currentCount);
    
    for(let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log('[IMPORT] Processing file:', file.name);
        const meta = await window.extractMetadata(file);
        console.log('[IMPORT] Extracted metadata:', meta.title, meta.artist);
        const result = await window.db.songs.add({ 
            title: meta.title, 
            artist: meta.artist, 
            album: meta.album || '',
            cover: meta.cover, 
            isFavorite: false, 
            source: 'local',
            fileBlob: file,
            originalFileName: file.name || '',
            mimeType: file.type || '',
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
    if (window.renderLibrary) window.renderLibrary();
    if (window.renderSidebarQueue) window.renderSidebarQueue();
    
    // Small delay to ensure DOM updates are rendered
    await new Promise(r => setTimeout(r, 100));
    dom.loader.classList.add('hidden');
    if (window.showToast) window.showToast('Files imported successfully!');
}
