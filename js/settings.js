// Настройки приложения
import { state, dom } from './state.js';
import { I18N } from './i18n.js?v=20260126-2';
import { refreshIcons } from './helpers.js';

// Определяет язык браузера и возвращает поддерживаемый язык
function detectBrowserLanguage() {
    const browserLang = navigator.language.split('-')[0].toLowerCase();
    const supportedLanguages = ['en', 'ru', 'es', 'de', 'fr'];
    
    if (supportedLanguages.includes(browserLang)) {
        return browserLang;
    }
    
    // Если язык браузера не поддерживается, возвращаем английский по умолчанию
    return 'en';
}

export async function loadSettings() {
    const lang = await window.db.settings.get('language');
    if (lang) {
        state.lang = lang.value;
    } else if (localStorage.getItem('language')) {
        state.lang = localStorage.getItem('language');
    } else {
        // Используем язык браузера по умолчанию
        state.lang = detectBrowserLanguage();
        localStorage.setItem('language', state.lang);
    }
    
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
    const t = I18N[state.lang];
    if (!t) {
        console.warn('[SETTINGS] Language not found:', state.lang, 'falling back to English');
        state.lang = 'en';
        return applyLanguage();
    }
    
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        if (t[key]) el.innerText = t[key];
    });
    
    // Обновляем атрибут lang для HTML документа
    document.documentElement.lang = state.lang;
    
    refreshIcons();
}

export function initSettingsHandlers() {
    window.changeLanguage = async (val) => {
        if (!I18N[val]) {
            console.error('[SETTINGS] Invalid language:', val);
            return;
        }
        
        state.lang = val;
        await window.db.settings.put({key: 'language', value: val});
        localStorage.setItem('language', val);
        applyLanguage();
    };
}
