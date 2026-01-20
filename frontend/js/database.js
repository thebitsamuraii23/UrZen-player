// Dexie/IndexedDB setup
import Dexie from 'dexie';
import { DB_NAME, DB_VERSION } from './constants.js';

export const db = new Dexie(DB_NAME);

// Define the schema without version increment for data preservation
// Dexie will automatically detect the latest schema
db.version(1).stores({
  songs: '++id, title, artist, isFavorite, order',
  playlists: '++id, name',
  settings: 'key'
});

// Handle schema upgrades if needed (new tables/indexes)
// This preserves existing data when adding new fields
db.version(DB_VERSION).stores({
  songs: '++id, title, artist, isFavorite, order',
  playlists: '++id, name',
  settings: 'key'
}).upgrade(tx => {
  // Migration logic here if needed in future
  console.log('[DB] Upgraded to version', DB_VERSION);
});
