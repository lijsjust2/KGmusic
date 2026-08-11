import { ref } from 'vue';
import { MoeAuthStore } from '../../stores/store';

let lastVipCheck = 0
const VIP_CHECK_INTERVAL = 5 * 60 * 1000

export function useHelpers(t) {
  const isInputFocused = ref(false);
  
  const isElectron = () => {
    return typeof window !== 'undefined' && typeof window.electron !== 'undefined';
  };
  
  const handleVolumeScroll = (event, volume, changeVolume) => {
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * -1;
    volume.value = Math.min(Math.max(volume.value + delta * 10, 0), 100);
    changeVolume();
  };
  
  const checkFocus = () => {
    isInputFocused.value = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  };
  
  const handleKeyDown = (event, handlers, isInputFocused) => {
    if(isInputFocused) return;
    
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        handlers.togglePlayPause();
        break;
      case 'ArrowLeft':
        handlers.playSongFromQueue('previous');
        break;
      case 'ArrowRight':
        handlers.playSongFromQueue('next');
        break;
      case 'Escape':
        if(handlers.showLyrics){
          handlers.toggleLyrics();
        }
        break;
    }
  };
  
  const desktopLyrics = () => {
    if (!isElectron()) return;
    
    let savedConfig = JSON.parse(localStorage.getItem('settings')) || {};
    if(!savedConfig?.desktopLyrics) savedConfig.desktopLyrics = 'off';
    let action = savedConfig?.desktopLyrics === 'off' ? 'display-lyrics' : 'close-lyrics';
    window.electron.ipcRenderer.send('desktop-lyrics-action', action);
    savedConfig.desktopLyrics = action === 'display-lyrics' ? 'on' : 'off';
    localStorage.setItem('settings', JSON.stringify(savedConfig));
  };
  
  const throttle = (func, delay) => {
    let lastTime = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastTime >= delay) {
        lastTime = now;
        func.apply(this, args);
      }
    };
  };
  
  const getVip = async () => {
    if (typeof MoeAuthStore !== 'function') return;
    const MoeAuth = MoeAuthStore();
    if (!MoeAuth.isAuthenticated) return;
    const now = Date.now()
    if (now - lastVipCheck < VIP_CHECK_INTERVAL) return
    lastVipCheck = now
    await MoeAuth.autoClaimVip();
  };
  
  return {
    isInputFocused,
    isElectron,
    handleVolumeScroll,
    checkFocus,
    handleKeyDown,
    desktopLyrics,
    throttle,
    getVip
  };
} 