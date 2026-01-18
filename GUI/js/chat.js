
let socket = null;
let isAuthenticated = false;
let messageQueue = [];
let chatUsername = '';
const SOCKET_URL = 'http://3.10.208.30:3001';
const MAX_MESSAGE_LENGTH = 500;

export async function initChat() {
  if (window.electronAPI?.loadChatUsername) {
    chatUsername = await window.electronAPI.loadChatUsername();
  }

  if (!chatUsername || chatUsername.trim() === '') {
    showUsernameModal();
    return;
  }

  setupChatUI();
  await connectToChat();
}

function showUsernameModal() {
  const modal = document.getElementById('chatUsernameModal');
  if (modal) {
    modal.style.display = 'flex';
    
    const input = document.getElementById('chatUsernameInput');
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
  }
}

function hideUsernameModal() {
  const modal = document.getElementById('chatUsernameModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function submitChatUsername() {
  const input = document.getElementById('chatUsernameInput');
  const errorMsg = document.getElementById('chatUsernameError');
  
  if (!input) return;

  const username = input.value.trim();

  if (username.length === 0) {
    if (errorMsg) errorMsg.textContent = 'Username cannot be empty';
    return;
  }

  if (username.length < 3) {
    if (errorMsg) errorMsg.textContent = 'Username must be at least 3 characters';
    return;
  }

  if (username.length > 20) {
    if (errorMsg) errorMsg.textContent = 'Username must be 20 characters or less';
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    if (errorMsg) errorMsg.textContent = 'Username can only contain letters, numbers, - and _';
    return;
  }

  chatUsername = username;
  if (window.electronAPI?.saveChatUsername) {
    await window.electronAPI.saveChatUsername(username);
  }

  hideUsernameModal();

  setupChatUI();
  await connectToChat();
}

function setupChatUI() {
  const sendBtn = document.getElementById('chatSendBtn');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

  if (!sendBtn || !chatInput || !chatMessages) {
    console.warn('Chat UI elements not found');
    return;
  }

  sendBtn.addEventListener('click', () => {
    sendMessage();
  });

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatInput.addEventListener('input', () => {
    if (chatInput.value.length > MAX_MESSAGE_LENGTH) {
      chatInput.value = chatInput.value.substring(0, MAX_MESSAGE_LENGTH);
    }
    updateCharCounter();
  });

  updateCharCounter();
}

async function connectToChat() {
  try {
    if (!window.io) {
      await loadSocketIO();
    }

    const userId = await window.electronAPI?.getUserId();

    if (!userId) {
      console.error('User ID not available');
      addSystemMessage('Error: Could not connect to chat');
      return;
    }

    if (!chatUsername || chatUsername.trim() === '') {
      console.error('Chat username not set');
      addSystemMessage('Error: Username not set');
      return;
    }

    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('Connected to chat server');
      socket.emit('authenticate', { username: chatUsername, userId });
    });

    socket.on('authenticated', (data) => {
      isAuthenticated = true;
      addSystemMessage(`Connected as ${data.username}`);
      
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        socket.emit('send_message', { message: msg });
      }
    });

    socket.on('message', (data) => {
      if (data.type === 'system') {
        addSystemMessage(data.message);
      } else if (data.type === 'user') {
        addUserMessage(data.username, data.message, data.timestamp);
      }
    });

    socket.on('users_update', (data) => {
      updateOnlineCount(data.count);
    });

    socket.on('error', (data) => {
      addSystemMessage(`Error: ${data.message}`, 'error');
    });

    socket.on('clear_chat', (data) => {
      clearAllMessages();
      addSystemMessage(data.message || 'Chat cleared by server', 'warning');
    });

    socket.on('disconnect', () => {
      isAuthenticated = false;
      console.log('Disconnected from chat server');
      addSystemMessage('Disconnected from chat', 'error');
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      addSystemMessage('Connection error. Retrying...', 'error');
    });

  } catch (error) {
    console.error('Error connecting to chat:', error);
    addSystemMessage('Failed to connect to chat server', 'error');
  }
}

function loadSocketIO() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.6.1/socket.io.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function sendMessage() {
  const chatInput = document.getElementById('chatInput');
  const message = chatInput.value.trim();

  if (!message || message.length === 0) {
    return;
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    addSystemMessage(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`, 'error');
    return;
  }

  if (!socket || !isAuthenticated) {
    messageQueue.push(message);
    addSystemMessage('Connecting... Your message will be sent soon.', 'warning');
    chatInput.value = '';
    updateCharCounter();
    return;
  }

  socket.emit('send_message', { message });
  
  chatInput.value = '';
  updateCharCounter();
}

function addUserMessage(username, message, timestamp) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message user-message';

  const time = new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  messageDiv.innerHTML = `
    <div class="message-header">
      <span class="message-username">${escapeHtml(username)}</span>
      <span class="message-time">${time}</span>
    </div>
    <div class="message-content">${message}</div>
  `;

  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

function addSystemMessage(message, type = 'info') {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message system-message system-${type}`;
  messageDiv.innerHTML = `
    <div class="message-content">
      <i class="fas fa-info-circle"></i> ${escapeHtml(message)}
    </div>
  `;

  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

function updateOnlineCount(count) {
  const onlineCountElement = document.getElementById('chatOnlineCount');
  if (onlineCountElement) {
    onlineCountElement.textContent = count;
  }
}

function updateCharCounter() {
  const chatInput = document.getElementById('chatInput');
  const charCounter = document.getElementById('chatCharCounter');
  
  if (chatInput && charCounter) {
    const length = chatInput.value.length;
    charCounter.textContent = `${length}/${MAX_MESSAGE_LENGTH}`;
    
    if (length > MAX_MESSAGE_LENGTH * 0.9) {
      charCounter.classList.add('warning');
    } else {
      charCounter.classList.remove('warning');
    }
  }
}

function scrollToBottom() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function clearAllMessages() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.innerHTML = '';
    console.log('Chat cleared');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.addEventListener('beforeunload', () => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const usernameSubmitBtn = document.getElementById('chatUsernameSubmit');
  const usernameCancelBtn = document.getElementById('chatUsernameCancel');
  const usernameInput = document.getElementById('chatUsernameInput');

  if (usernameSubmitBtn) {
    usernameSubmitBtn.addEventListener('click', submitChatUsername);
  }

  if (usernameCancelBtn) {
    usernameCancelBtn.addEventListener('click', () => {
      hideUsernameModal();
      const playNavItem = document.querySelector('[data-page="play"]');
      if (playNavItem) playNavItem.click();
    });
  }

  if (usernameInput) {
    usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitChatUsername();
      }
    });
  }

  const chatNavItem = document.querySelector('[data-page="chat"]');
  if (chatNavItem) {
    chatNavItem.addEventListener('click', () => {
      if (!socket) {
        initChat();
      }
    });
  }
});

window.ChatAPI = {
  send: sendMessage,
  disconnect: () => socket?.disconnect()
};
