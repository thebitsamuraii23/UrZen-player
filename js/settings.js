// Настройки приложения
import { state, dom } from './state.js';
import { I18N } from './i18n.js?v=20260126-2';
import { refreshIcons, showToast } from './helpers.js';

const DEFAULT_NAVIDROME_SERVER = 'https://music.youtubemusicdownloader.life';
const DEFAULT_NAVIDROME_USER = 'guest';
const DEFAULT_NAVIDROME_PASS = 'guest';

// Определяет язык браузера и возвращает поддерживаемый язык
function detectBrowserLanguage() {
    const browserLang = navigator.language.split('-')[0].toLowerCase();
    const supportedLanguages = ['en', 'ru', 'es', 'de', 'fr', 'ua', 'uk'];
    
    if (supportedLanguages.includes(browserLang)) {
        return browserLang;
    }
    
    // Если язык браузера не поддерживается, возвращаем английский по умолчанию
    return 'en';
}

export function normalizeLang(lang) {
    if (!lang) return 'en';
    const lower = String(lang).toLowerCase();
    if (lower === 'uk') return 'ua';
    if (lower === 'ua') return 'ua';
    if (I18N[lower]) return lower;
    return 'en';
}

export function t(key, fallback = '') {
    const lang = normalizeLang(state.lang);
    return I18N[lang]?.[key] ?? I18N.en?.[key] ?? fallback;
}

export async function loadSettings() {
    const lang = await window.db.settings.get('language');
    if (lang) {
        state.lang = lang.value;
    } else if (localStorage.getItem('language')) {
        state.lang = localStorage.getItem('language');
    } else {
        // Используем язык браузера по умолчанию
        state.lang = normalizeLang(detectBrowserLanguage());
        localStorage.setItem('language', state.lang);
    }
    
    state.lang = normalizeLang(state.lang);
    
    document.getElementById('langSelect').value = state.lang;
    
    const bass = await window.db.settings.get('bassEnabled');
    if (bass !== undefined) state.bassEnabled = bass.value;
    else if (localStorage.getItem('bassEnabled')) state.bassEnabled = localStorage.getItem('bassEnabled') === 'true';
    dom.bassCheck.checked = state.bassEnabled;
    
    const bGain = await window.db.settings.get('bassGain');
    if (bGain !== undefined) state.bassGain = bGain.value;
    else if (localStorage.getItem('bassGain')) state.bassGain = parseFloat(localStorage.getItem('bassGain'));
    
    dom.bassSlider.value = state.bassGain;
    if (window.updateBassGain) window.updateBassGain(state.bassGain);

    const shuff = await window.db.settings.get('shuffle');
    if (shuff !== undefined) state.shuffle = shuff.value;
    else if (localStorage.getItem('shuffle')) state.shuffle = localStorage.getItem('shuffle') === 'true';

    const rep = await window.db.settings.get('repeat');
    if (rep !== undefined) state.repeat = rep.value;
    else if (localStorage.getItem('repeat')) state.repeat = localStorage.getItem('repeat');
    
    // Загружаем последний открытый таб
    const tab = localStorage.getItem('currentTab');
    if (tab) {
        try {
            state.currentTab = JSON.parse(tab);
        } catch (e) {
            state.currentTab = 'all';
        }
    }
    
    // Загружаем Navidrome избранное
    const navFavorites = localStorage.getItem('navidromeFavorites');
    if (navFavorites) {
        try {
            window.navidromeFavorites = JSON.parse(navFavorites);
        } catch (e) {
            window.navidromeFavorites = [];
        }
    }

    // Загружаем сохраненный медиасервер (если есть) в state для информативных целей
    try {
        const savedServer = await window.db.settings.get('navidromeServer');
        if (savedServer?.value) {
            state.navidromeServer = savedServer.value;
        } else {
            state.navidromeServer = localStorage.getItem('navidromeServer') || null;
        }
    } catch (e) {
        state.navidromeServer = localStorage.getItem('navidromeServer') || null;
    }

    try {
        const savedUser = await window.db.settings.get('navidromeUser');
        if (savedUser?.value) {
            state.navidromeUser = savedUser.value;
        } else {
            state.navidromeUser = localStorage.getItem('navidromeUser') || '';
        }
    } catch (e) {
        state.navidromeUser = localStorage.getItem('navidromeUser') || '';
    }

    try {
        const savedPass = await window.db.settings.get('navidromePass');
        if (savedPass?.value) {
            state.navidromePass = savedPass.value;
        } else {
            state.navidromePass = localStorage.getItem('navidromePass') || '';
        }
    } catch (e) {
        state.navidromePass = localStorage.getItem('navidromePass') || '';
    }
}

export function applyLanguage() {
    const lang = normalizeLang(state.lang);
    const dict = I18N[lang] || I18N.en;
    if (!dict) {
        console.warn('[SETTINGS] Language not found:', state.lang, 'falling back to English');
        state.lang = 'en';
        return applyLanguage();
    }
    
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        const value = dict[key] ?? I18N.en?.[key];
        if (value !== undefined) el.innerText = value;
    });
    
    document.querySelectorAll('[data-t-placeholder]').forEach(el => {
        const key = el.getAttribute('data-t-placeholder');
        const value = dict[key] ?? I18N.en?.[key];
        if (value !== undefined) el.setAttribute('placeholder', value);
    });
    
    document.querySelectorAll('[data-t-title]').forEach(el => {
        const key = el.getAttribute('data-t-title');
        const value = dict[key] ?? I18N.en?.[key];
        if (value !== undefined) el.setAttribute('title', value);
    });
    
    document.querySelectorAll('[data-t-aria-label]').forEach(el => {
        const key = el.getAttribute('data-t-aria-label');
        const value = dict[key] ?? I18N.en?.[key];
        if (value !== undefined) el.setAttribute('aria-label', value);
    });

    document.querySelectorAll('[data-t-alt]').forEach(el => {
        const key = el.getAttribute('data-t-alt');
        const value = dict[key] ?? I18N.en?.[key];
        if (value !== undefined) el.setAttribute('alt', value);
    });
    
    const pageTitle = dict.page_title ?? I18N.en?.page_title;
    if (pageTitle) document.title = pageTitle;
    
    // Обновляем атрибут lang для HTML документа
    document.documentElement.lang = lang;
    
    refreshIcons();
}

export function initSettingsHandlers() {
    window.changeLanguage = async (val) => {
        const normalized = normalizeLang(val);
        if (!I18N[normalized]) {
            console.error('[SETTINGS] Invalid language:', val);
            return;
        }
        
        state.lang = normalized;
        await window.db.settings.put({key: 'language', value: normalized});
        localStorage.setItem('language', normalized);
        applyLanguage();
    };

    window.changeMediaServer = async () => {
        const modal = document.getElementById('mediaServerModal');
        if (!modal) return;
        const serverInput = document.getElementById('mediaServerUrl');
        const userInput = document.getElementById('mediaServerUser');
        const passInput = document.getElementById('mediaServerPass');

        if (serverInput) {
            serverInput.value = state.navidromeServer || localStorage.getItem('navidromeServer') || DEFAULT_NAVIDROME_SERVER;
        }
        if (userInput) {
            userInput.value = state.navidromeUser || localStorage.getItem('navidromeUser') || DEFAULT_NAVIDROME_USER;
        }
        if (passInput) {
            passInput.value = state.navidromePass || localStorage.getItem('navidromePass') || DEFAULT_NAVIDROME_PASS;
        }

        modal.classList.add('active');
    };

    window.closeMediaServerModal = () => {
        const modal = document.getElementById('mediaServerModal');
        if (modal) modal.classList.remove('active');
    };

    window.saveMediaServerSettings = async () => {
        const serverInput = document.getElementById('mediaServerUrl');
        const userInput = document.getElementById('mediaServerUser');
        const passInput = document.getElementById('mediaServerPass');
        if (!serverInput) return;

        const trimmed = (serverInput.value || '').trim();
        const isValid = /^https?:\/\//i.test(trimmed);
        if (!isValid) {
            showToast(t('invalid_server_url', 'Invalid server URL'));
            return;
        }

        const normalized = trimmed.replace(/\/$/, '');
        const user = (userInput?.value || '').trim() || DEFAULT_NAVIDROME_USER;
        const pass = (passInput?.value || '').trim() || DEFAULT_NAVIDROME_PASS;

        try {
            await window.db.settings.put({ key: 'navidromeServer', value: normalized });
            await window.db.settings.put({ key: 'navidromeUser', value: user });
            await window.db.settings.put({ key: 'navidromePass', value: pass });
        } catch (e) {
            console.warn('[SETTINGS] Failed to save server to DB, falling back to localStorage:', e);
        }
        localStorage.setItem('navidromeServer', normalized);
        localStorage.setItem('navidromeUser', user);
        localStorage.setItem('navidromePass', pass);
        state.navidromeServer = normalized;
        state.navidromeUser = user;
        state.navidromePass = pass;

        // Clear navidrome caches to force reload from new server
        localStorage.removeItem('navidromeSongs');
        localStorage.removeItem('navidromeSongsLastUpdate');
        window._navidromeSongsCache = [];
        if (window.state) window.state.navidromeSongs = [];

        showToast(t('server_saved', 'Media server updated'));
        window.closeMediaServerModal();

        if (window.state?.currentTab === 'navidrome' && window.switchTab) {
            window.switchTab('navidrome');
        }
    };

    window.resetMediaServer = async () => {
        try {
            await window.db.settings.delete('navidromeServer');
            await window.db.settings.delete('navidromeUser');
            await window.db.settings.delete('navidromePass');
        } catch (e) {
            console.warn('[SETTINGS] Failed to delete server from DB:', e);
        }
        localStorage.removeItem('navidromeServer');
        localStorage.removeItem('navidromeUser');
        localStorage.removeItem('navidromePass');
        state.navidromeServer = null;
        state.navidromeUser = '';
        state.navidromePass = '';
        localStorage.removeItem('navidromeSongs');
        localStorage.removeItem('navidromeSongsLastUpdate');
        window._navidromeSongsCache = [];
        if (window.state) window.state.navidromeSongs = [];
        showToast(t('server_reset', 'Media server reset to default'));
        if (window.state?.currentTab === 'navidrome' && window.switchTab) {
            window.switchTab('navidrome');
        }
    };
}

// Expose translation helper for non-module scripts
window.t = t;
