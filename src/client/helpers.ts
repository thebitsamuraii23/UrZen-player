// @ts-nocheck
// Вспомогательные функции
export function formatTime(s) {
    const m = Math.floor(s/60);
    const sec = Math.floor(s%60);
    return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
}

export function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 2500);
}

export function refreshIcons() { 
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}
