let messageContainer = null

const createContainer = () => {
  if (messageContainer) return
  
  messageContainer = document.createElement('div')
  messageContainer.className = 'message-container'
  messageContainer.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
  `
  document.body.appendChild(messageContainer)
}

const showMessage = (message, type = 'info', duration = 3000) => {
  createContainer()
  
  const messageEl = document.createElement('div')
  messageEl.className = `message message-${type}`
  
  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  }
  
  messageEl.innerHTML = `
    <span class="message-icon">${iconMap[type] || ''}</span>
    <span class="message-content">${message}</span>
  `
  
  messageEl.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 14px;
    font-weight: 500;
    animation: messageSlideIn 0.3s ease-out;
    pointer-events: auto;
    min-width: 200px;
    max-width: 400px;
  `
  
  const typeStyles = {
    success: 'color: #52c41a; border-left: 4px solid #52c41a;',
    error: 'color: #ff4d4f; border-left: 4px solid #ff4d4f;',
    warning: 'color: #faad14; border-left: 4px solid #faad14;',
    info: 'color: #1890ff; border-left: 4px solid #1890ff;'
  }
  
  messageEl.style.cssText += typeStyles[type] || typeStyles.info
  
  if (!document.querySelector('.message-style')) {
    const style = document.createElement('style')
    style.className = 'message-style'
    style.textContent = `
      @keyframes messageSlideIn {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes messageFadeOut {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0;
          transform: translateY(-20px);
        }
      }
      .message-icon {
        font-size: 16px;
        font-weight: bold;
      }
    `
    document.head.appendChild(style)
  }
  
  messageContainer.appendChild(messageEl)
  
  setTimeout(() => {
    messageEl.style.animation = 'messageFadeOut 0.3s ease-out forwards'
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl)
      }
    }, 300)
  }, duration)
}

const message = {
  success: (msg, duration) => showMessage(msg, 'success', duration),
  error: (msg, duration) => showMessage(msg, 'error', duration),
  warning: (msg, duration) => showMessage(msg, 'warning', duration),
  info: (msg, duration) => showMessage(msg, 'info', duration)
}

export default message
