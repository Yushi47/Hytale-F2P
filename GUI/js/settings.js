
let customJavaCheck;
let customJavaOptions;
let customJavaPath;
let browseJavaBtn;
let settingsPlayerName;

export function initSettings() {
  setupSettingsElements();
  loadAllSettings();
}

function setupSettingsElements() {
  customJavaCheck = document.getElementById('customJavaCheck');
  customJavaOptions = document.getElementById('customJavaOptions');
  customJavaPath = document.getElementById('customJavaPath');
  browseJavaBtn = document.getElementById('browseJavaBtn');
  settingsPlayerName = document.getElementById('settingsPlayerName');

  if (customJavaCheck) {
    customJavaCheck.addEventListener('change', toggleCustomJava);
  }

  if (browseJavaBtn) {
    browseJavaBtn.addEventListener('click', browseJavaPath);
  }

  if (settingsPlayerName) {
    settingsPlayerName.addEventListener('change', savePlayerName);
  }
}

function toggleCustomJava() {
  if (!customJavaOptions) return;
  
  if (customJavaCheck && customJavaCheck.checked) {
    customJavaOptions.style.display = 'block';
  } else {
    customJavaOptions.style.display = 'none';
    if (customJavaPath) customJavaPath.value = '';
    saveCustomJavaPath('');
  }
}

async function browseJavaPath() {
  try {
    if (window.electronAPI && window.electronAPI.browseJavaPath) {
      const result = await window.electronAPI.browseJavaPath();
      if (result && result.filePaths && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        if (customJavaPath) {
          customJavaPath.value = selectedPath;
        }
        await saveCustomJavaPath(selectedPath);
      }
    }
  } catch (error) {
    console.error('Error browsing Java path:', error);
  }
}

async function saveCustomJavaPath(path) {
  try {
    if (window.electronAPI && window.electronAPI.saveJavaPath) {
      await window.electronAPI.saveJavaPath(path);
    }
  } catch (error) {
    console.error('Error saving custom Java path:', error);
  }
}

async function loadCustomJavaPath() {
  try {
    if (window.electronAPI && window.electronAPI.loadJavaPath) {
      const savedPath = await window.electronAPI.loadJavaPath();
      if (savedPath && savedPath.trim()) {
        if (customJavaPath) {
          customJavaPath.value = savedPath;
        }
        if (customJavaCheck) {
          customJavaCheck.checked = true;
        }
        if (customJavaOptions) {
          customJavaOptions.style.display = 'block';
        }
      }
    }
  } catch (error) {
    console.error('Error loading custom Java path:', error);
  }
}

async function savePlayerName() {
  try {
    if (window.electronAPI && window.electronAPI.saveUsername && settingsPlayerName) {
      const playerName = settingsPlayerName.value.trim() || 'Player';
      await window.electronAPI.saveUsername(playerName);
    }
  } catch (error) {
    console.error('Error saving player name:', error);
  }
}

async function loadPlayerName() {
  try {
    if (window.electronAPI && window.electronAPI.loadUsername && settingsPlayerName) {
      const savedName = await window.electronAPI.loadUsername();
      if (savedName) {
        settingsPlayerName.value = savedName;
      }
    }
  } catch (error) {
    console.error('Error loading player name:', error);
  }
}

async function loadAllSettings() {
  await loadCustomJavaPath();
  await loadPlayerName();
}


export function getCurrentJavaPath() {
  if (customJavaCheck && customJavaCheck.checked && customJavaPath) {
    return customJavaPath.value.trim();
  }
  return '';
}


export function getCurrentPlayerName() {
  if (settingsPlayerName && settingsPlayerName.value.trim()) {
    return settingsPlayerName.value.trim();
  }
  return 'Player';
}

document.addEventListener('DOMContentLoaded', initSettings);

window.SettingsAPI = {
  getCurrentJavaPath,
  getCurrentPlayerName
};