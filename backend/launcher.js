const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

function getAppDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Local', 'HytaleF2P');
  } else if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'HytaleF2P');
  } else {
    return path.join(home, '.hytalef2p');
  }
}

const APP_DIR = getAppDir();
const CACHE_DIR = path.join(APP_DIR, 'cache');
const TOOLS_DIR = path.join(APP_DIR, 'butler');
const GAME_DIR = path.join(APP_DIR, 'release', 'package', 'game', 'latest');
const JRE_DIR = path.join(APP_DIR, 'release', 'package', 'jre', 'latest');
const CONFIG_FILE = path.join(APP_DIR, 'config.json');

function getOS() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'linux') return 'linux';
  return 'unknown';
}

function getArch() {
  return process.arch === 'x64' ? 'amd64' : process.arch;
}

function createFolders() {
  const dirs = [
    APP_DIR,
    CACHE_DIR,
    TOOLS_DIR,
    path.join(APP_DIR, 'release', 'package', 'jre'),
    path.join(APP_DIR, 'release', 'package', 'game')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

async function downloadFile(url, dest, progressCallback) {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://launcher.hytale.com/'
    }
  });

  const totalSize = parseInt(response.headers['content-length'], 10);
  let downloaded = 0;
  const startTime = Date.now();

  const writer = fs.createWriteStream(dest);

  response.data.on('data', (chunk) => {
    downloaded += chunk.length;
    if (progressCallback && totalSize > 0) {
      const percent = Math.min(100, Math.max(0, (downloaded / totalSize) * 100));
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = elapsed > 0 ? downloaded / elapsed : 0;
      progressCallback(null, percent, speed, downloaded, totalSize);
    }
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    response.data.on('error', reject);
  });
}

async function installButler() {
  createFolders();
  
  const butlerName = process.platform === 'win32' ? 'butler.exe' : 'butler';
  const butlerPath = path.join(TOOLS_DIR, butlerName);
  const zipPath = path.join(TOOLS_DIR, 'butler.zip');

  if (fs.existsSync(butlerPath)) {
    return butlerPath;
  }

  let url;
  const osName = getOS();
  if (osName === 'windows') {
    url = 'https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default';
  } else if (osName === 'darwin') {
    url = 'https://broth.itch.zone/butler/darwin-amd64/LATEST/archive/default';
  } else if (osName === 'linux') {
    url = 'https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default';
  } else {
    throw new Error('Operating system not supported');
  }

  console.log('Fetching Butler tool...');
  await downloadFile(url, zipPath);

  console.log('Unpacking Butler...');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(TOOLS_DIR, true);

  if (process.platform !== 'win32') {
    fs.chmodSync(butlerPath, 0o755);
  }

  try {
    fs.unlinkSync(zipPath);
  } catch (err) {
    console.log('Notice: could not delete butler.zip');
  }

  return butlerPath;
}

async function downloadPWR(version = 'release', fileName = '1.pwr', progressCallback) {
  createFolders();
  
  const osName = getOS();
  const arch = getArch();
  const url = `https://game-patches.hytale.com/patches/${osName}/${arch}/${version}/0/${fileName}`;
  
  const dest = path.join(CACHE_DIR, fileName);

  if (fs.existsSync(dest)) {
    console.log('PWR file found in cache:', dest);
    return dest;
  }

  console.log('Fetching PWR patch file:', url);
  await downloadFile(url, dest, progressCallback);
  console.log('PWR saved to:', dest);
  
  return dest;
}

async function applyPWR(pwrFile, progressCallback) {
  const butlerPath = await installButler();
  const gameLatest = GAME_DIR;
  const stagingDir = path.join(gameLatest, 'staging-temp');
  
  const gameClient = process.platform === 'win32' ? 'HytaleClient.exe' : 'HytaleClient';
  const clientPath = path.join(gameLatest, 'Client', gameClient);
  
  if (fs.existsSync(clientPath)) {
    console.log('Game files detected, skipping patch installation.');
    return;
  }

  if (!fs.existsSync(gameLatest)) {
    fs.mkdirSync(gameLatest, { recursive: true });
  }
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  if (progressCallback) {
    progressCallback('Installing game patch...', null, null, null, null);
  }

  console.log('Installing game patch...');
  
  if (!fs.existsSync(butlerPath)) {
    throw new Error(`Butler tool not found at: ${butlerPath}`);
  }
  
  if (!fs.existsSync(pwrFile)) {
    throw new Error(`PWR file not found at: ${pwrFile}`);
  }

  const args = [
    'apply',
    '--staging-dir',
    stagingDir,
    pwrFile,
    gameLatest
  ];
  
  try {
    await new Promise((resolve, reject) => {
      const child = execFile(butlerPath, args, {
        maxBuffer: 1024 * 1024 * 10,
        timeout: 600000
      }, (error, stdout, stderr) => {
        if (error) {
          console.error('Butler stderr:', stderr);
          console.error('Butler stdout:', stdout);
          reject(new Error(`Patch installation failed: ${error.message}${stderr ? '\n' + stderr : ''}`));
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    throw error;
  }

  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  if (progressCallback) {
    progressCallback('Installation complete', null, null, null, null);
  }
  console.log('Installation complete');
}

async function downloadJRE(progressCallback) {
  createFolders();
  
  const osName = getOS();
  const arch = getArch();

  const javaBin = path.join(JRE_DIR, 'bin', 'java' + (process.platform === 'win32' ? '.exe' : ''));
  if (fs.existsSync(javaBin)) {
    console.log('Java runtime found, skipping download');
    return;
  }

  console.log('Requesting Java runtime information...');
  const response = await axios.get('https://launcher.hytale.com/version/release/jre.json', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const jreData = response.data;

  const osData = jreData.download_url[osName];
  if (!osData) {
    throw new Error(`Java runtime unavailable for platform: ${osName}`);
  }

  const platform = osData[arch];
  if (!platform) {
    throw new Error(`Java runtime unavailable for architecture ${arch} on ${osName}`);
  }

  const fileName = path.basename(platform.url);
  const cacheFile = path.join(CACHE_DIR, fileName);

  if (!fs.existsSync(cacheFile)) {
    if (progressCallback) {
      progressCallback('Fetching Java runtime...', null, null, null, null);
    }
    console.log('Fetching Java runtime...');
    await downloadFile(platform.url, cacheFile, progressCallback);
    console.log('Download finished');
  }

  if (progressCallback) {
    progressCallback('Validating files...', null, null, null, null);
  }
  console.log('Validating files...');
  const fileBuffer = fs.readFileSync(cacheFile);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest('hex');
  
  if (hex !== platform.sha256) {
    fs.unlinkSync(cacheFile);
    throw new Error(`File validation failed: expected ${platform.sha256} but got ${hex}`);
  }

  if (progressCallback) {
    progressCallback('Unpacking Java runtime...', null, null, null, null);
  }
  console.log('Unpacking Java runtime...');
  await extractJRE(cacheFile, JRE_DIR);

  if (process.platform !== 'win32') {
    const java = path.join(JRE_DIR, 'bin', 'java');
    if (fs.existsSync(java)) {
      fs.chmodSync(java, 0o755);
    }
  }

  flattenJREDir(JRE_DIR);

  try {
    fs.unlinkSync(cacheFile);
  } catch (err) {
    console.log('Notice: could not delete cached Java files:', err.message);
  }

  console.log('Java runtime ready');
}

async function extractJRE(archivePath, destDir) {
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  if (archivePath.endsWith('.zip')) {
    return extractZip(archivePath, destDir);
  } else if (archivePath.endsWith('.tar.gz')) {
    return extractTarGz(archivePath, destDir);
  } else {
    throw new Error(`Archive type not supported: ${archivePath}`);
  }
}

function extractZip(zipPath, dest) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const entryPath = path.join(dest, entry.entryName);
    
    const resolvedPath = path.resolve(entryPath);
    const resolvedDest = path.resolve(dest);
    if (!resolvedPath.startsWith(resolvedDest)) {
      throw new Error(`Invalid file path detected: ${entryPath}`);
    }

    if (entry.isDirectory) {
      fs.mkdirSync(entryPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(entryPath), { recursive: true });
      fs.writeFileSync(entryPath, entry.getData());
      if (process.platform !== 'win32') {
        fs.chmodSync(entryPath, entry.header.attr >>> 16);
      }
    }
  }
}

function extractTarGz(tarGzPath, dest) {
  const tar = require('tar');
  return tar.extract({
    file: tarGzPath,
    cwd: dest,
    strip: 0
  });
}

function flattenJREDir(jreLatest) {
  try {
    const entries = fs.readdirSync(jreLatest, { withFileTypes: true });
    
    if (entries.length !== 1 || !entries[0].isDirectory()) {
      return;
    }

    const nested = path.join(jreLatest, entries[0].name);
    const files = fs.readdirSync(nested, { withFileTypes: true });

    for (const file of files) {
      const oldPath = path.join(nested, file.name);
      const newPath = path.join(jreLatest, file.name);
      fs.renameSync(oldPath, newPath);
    }

    fs.rmSync(nested, { recursive: true, force: true });
  } catch (err) {
    console.log('Notice: could not restructure Java directory:', err.message);
  }
}

function getJavaExec() {
  const javaBin = path.join(JRE_DIR, 'bin', 'java' + (process.platform === 'win32' ? '.exe' : ''));

  if (fs.existsSync(javaBin)) {
    return javaBin;
  }

  console.log('Notice: Java runtime not found, using system default');
  return 'java';
}

async function launchGame(playerName = 'Player', progressCallback) {
  createFolders();
  
  saveUsername(playerName);

  await downloadJRE(progressCallback);

  const javaBin = getJavaExec();

  const gameLatest = GAME_DIR;
  const gameClient = process.platform === 'win32' ? 'HytaleClient.exe' : 'HytaleClient';
  const clientPath = path.join(gameLatest, 'Client', gameClient);

  if (!fs.existsSync(clientPath)) {
    if (progressCallback) {
      progressCallback('Fetching game files...', null, null, null, null);
    }
    console.log('Game files missing, downloading and installing patch...');
    const pwrFile = await downloadPWR('release', '1.pwr', progressCallback);
    await applyPWR(pwrFile, progressCallback);
  }

  if (!fs.existsSync(clientPath)) {
    throw new Error(`Game client missing at path: ${clientPath}`);
  }

  const uuid = uuidv4();
  const args = [
    '--app-dir', gameLatest,
    '--java-exec', javaBin,
    '--auth-mode', 'offline',
    '--uuid', uuid,
    '--name', playerName
  ];

  if (progressCallback) {
    progressCallback('Starting game...', null, null, null, null);
  }
  console.log('Starting game...');
  console.log(`Command: "${clientPath}" ${args.join(' ')}`);
  
  const child = exec(`"${clientPath}" ${args.map(a => `"${a}"`).join(' ')}`, {
    stdio: 'inherit',
    detached: true
  });

  child.unref();
}

function saveUsername(username) {
  try {
    createFolders();
    const config = { username: username || 'Player' };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.log('Notice: could not save username:', err.message);
  }
}

function loadUsername() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return config.username || 'Player';
    }
  } catch (err) {
    console.log('Notice: could not load username:', err.message);
  }
  return 'Player';
}

module.exports = {
  launchGame,
  saveUsername,
  loadUsername
};
