// Настройки приложения
import { state, dom } from './state.js';
import { I18N } from './i18n.js?v=20260126-2';
import { refreshIcons } from './helpers.js';

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
}

// Expose translation helper for non-module scripts
window.t = t;
