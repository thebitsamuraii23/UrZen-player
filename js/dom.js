// DOM элементы и селекторы
export const dom = {
  audio: null,
  playBtn: null,
  // ... все DOM элементы
};

/**
 * Инициализация DOM элементов
 */
export function initDOM() {
  dom.audio = document.getElementById('audioSource');
  // ... инициализация других элементов
}
