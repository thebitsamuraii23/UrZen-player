// Глобальное состояние приложения
export const state = {
    library: [],
    playlists: [],
    currentTab: 'all',
    currentIndex: -1,
    audioCtx: null,
    analyser: null,
    bassFilter: null,
    isPlaying: false,
    lang: 'en',
    pendingSongId: null,
    bassEnabled: true,
    bassGain: 15,
    isZen: false,
    draggedItem: null,
    shuffle: false,
    repeat: 'none'
};

// DOM элементы
export const dom = {
    audio: null,
    playBtn: null,
    playIcon: null,
    playlist: null,
    trackName: null,
    artistName: null,
    mainCover: null,
    vinylContainer: null,
    progFill: null,
    progBar: null,
    volFill: null,
    volBar: null,
    timeCur: null,
    timeDur: null,
    loader: null,
    bassCheck: null,
    bassPanel: null,
    bassSlider: null,
    bassValText: null,
    mainApp: null,
    zenOverlay: null,
    heroSlot: null,
    mainContent: null,
    visualizer: null,
    shuffleBtn: null,
    repeatBtn: null
};

// Инициализация DOM ссылок
export function initDOM() {
    dom.audio = document.getElementById('audioSource');
    dom.playBtn = document.getElementById('btnPlay');
    dom.playIcon = document.getElementById('playIconUI');
    dom.playlist = document.getElementById('playlist');
    dom.trackName = document.getElementById('trackName');
    dom.artistName = document.getElementById('artistName');
    dom.mainCover = document.getElementById('mainCover');
    dom.vinylContainer = document.getElementById('vinylContainer');
    dom.progFill = document.getElementById('progFill');
    dom.progBar = document.getElementById('progBar');
    dom.volFill = document.getElementById('volFill');
    dom.volBar = document.getElementById('volBar');
    dom.timeCur = document.getElementById('timeCur');
    dom.timeDur = document.getElementById('timeDur');
    dom.loader = document.getElementById('appLoader');
    dom.bassCheck = document.getElementById('bassBoostCheck');
    dom.bassPanel = document.getElementById('bassBoostPanel');
    dom.bassSlider = document.getElementById('bassGainSlider');
    dom.bassValText = document.getElementById('bassGainVal');
    dom.mainApp = document.getElementById('mainApp');
    dom.zenOverlay = document.getElementById('zenOverlay');
    dom.heroSlot = document.getElementById('heroSlot');
    dom.mainContent = document.getElementById('mainContent');
    dom.visualizer = document.getElementById('visualizerCanvas');
    dom.shuffleBtn = document.getElementById('shuffleBtn');
    dom.repeatBtn = document.getElementById('repeatBtn');
}
