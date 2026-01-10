// Dexie/IndexedDB setup
import Dexie from 'dexie';
import { DB_NAME, DB_VERSION } from './constants.js';

export const db = new Dexie(DB_NAME);
db.version(DB_VERSION).stores({
  songs: '++id, title, artist, isFavorite, order',
  playlists: '++id, name',
  settings: 'key'
});
