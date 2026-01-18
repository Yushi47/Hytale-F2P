let isDownloading = false;

let playBtn;
let playText;
let homePlayBtn;
let uninstallBtn;
let playerNameInput;
let javaPathInput;

export function setupLauncher() {
  playBtn = document.getElementById('playBtn');
  playText = document.getElementById('playText');
  homePlayBtn = document.getElementById('homePlayBtn');
  uninstallBtn = document.getElementById('uninstallBtn');
  playerNameInput = document.getElementById('playerName');
  javaPathInput = document.getElementById('javaPath');
  
  if (playerNameInput) {
    playerNameInput.addEventListener('change', savePlayerName);
  }
  
  if (javaPathInput) {
    javaPathInput.addEventListener('change', saveJavaPath);
  }
  
  if (window.electronAPI && window.electronAPI.onProgressUpdate) {
    window.electronAPI.onProgressUpdate((data) => {
      if (window.LauncherUI) {
        window.LauncherUI.showProgress();
        window.LauncherUI.updateProgress(data);
      }
    });
  }
}

export async function launch() {
  if (isDownloading || (playBtn && playBtn.disabled)) return;
  
  let playerName = 'Player';
  if (window.SettingsAPI && window.SettingsAPI.getCurrentPlayerName) {
    playerName = window.SettingsAPI.getCurrentPlayerName();
  } else if (playerNameInput && playerNameInput.value.trim()) {
    playerName = playerNameInput.value.trim();
  }
  
  let javaPath = '';
  if (window.SettingsAPI && window.SettingsAPI.getCurrentJavaPath) {
    javaPath = window.SettingsAPI.getCurrentJavaPath();
  }
  
  if (window.LauncherUI) window.LauncherUI.showProgress();
  isDownloading = true;
  if (playBtn) {
    playBtn.disabled = true;
    playText.textContent = 'LAUNCHING...';
  }
  
  try {
    if (window.electronAPI && window.electronAPI.launchGame) {
      const result = await window.electronAPI.launchGame(playerName, javaPath, '');
      
      if (result.success) {
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: 'Game started successfully!' });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
            if (window.electronAPI.minimizeWindow) {
              window.electronAPI.minimizeWindow();
            }
          }, 2000);
        }
      } else {
        throw new Error(result.error || 'Launch failed');
      }
    } else {
      setTimeout(() => {
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: 'Game started successfully!' });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
            resetPlayButton();
          }, 2000);
        }
      }, 2000);
    }
  } catch (error) {
    if (window.LauncherUI) {
      window.LauncherUI.updateProgress({ message: `Failed: ${error.message}` });
      setTimeout(() => {
        window.LauncherUI.hideProgress();
        resetPlayButton();
      }, 3000);
    }
  }
}

export async function uninstallGame() {
  if (!confirm('Are you sure you want to uninstall Hytale? All game files will be deleted.')) {
    return;
  }
  
  if (window.LauncherUI) window.LauncherUI.showProgress();
  if (window.LauncherUI) window.LauncherUI.updateProgress({ message: 'Uninstalling game...' });
  if (uninstallBtn) uninstallBtn.disabled = true;
  
  try {
    if (window.electronAPI && window.electronAPI.uninstallGame) {
      const result = await window.electronAPI.uninstallGame();
      
      if (result.success) {
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: 'Game uninstalled successfully!' });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
            window.LauncherUI.showLauncherOrInstall(false);
          }, 2000);
        }
      } else {
        throw new Error(result.error || 'Uninstall failed');
      }
    } else {
      setTimeout(() => {
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: 'Game uninstalled successfully!' });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
            window.LauncherUI.showLauncherOrInstall(false);
          }, 2000);
        }
      }, 2000);
    }
  } catch (error) {
    if (window.LauncherUI) {
      window.LauncherUI.updateProgress({ message: `Uninstall failed: ${error.message}` });
      setTimeout(() => window.LauncherUI.hideProgress(), 3000);
    }
  } finally {
    if (uninstallBtn) uninstallBtn.disabled = false;
  }
}

function resetPlayButton() {
  isDownloading = false;
  if (playBtn) {
    playBtn.disabled = false;
    playText.textContent = 'PLAY';
  }
}

async function savePlayerName() {
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      const playerName = (playerNameInput ? playerNameInput.value.trim() : '') || 'Player';
      await window.electronAPI.saveSettings({ playerName });
    }
  } catch (error) {
    console.error('Error saving player name:', error);
  }
}

async function saveJavaPath() {
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      const javaPath = (javaPathInput ? javaPathInput.value.trim() : '') || '';
      await window.electronAPI.saveSettings({ javaPath });
    }
  } catch (error) {
    console.error('Error saving Java path:', error);
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

window.launch = launch;
window.uninstallGame = uninstallGame;

document.addEventListener('DOMContentLoaded', setupLauncher);
