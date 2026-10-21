const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = process.env.PORT || 8766;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// Enforce single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function getBackendExecutable() {
  if (app.isPackaged) {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'squirrelmap-backend.exe' : 'squirrelmap-backend';
    
    // Check possible locations within extraResources
    const possiblePaths = [
      path.join(process.resourcesPath, 'backend-bin', binaryName),
      path.join(process.resourcesPath, 'backend-bin', 'squirrelmap-backend', binaryName),
      path.join(process.resourcesPath, binaryName)
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return { command: p, args: [] };
      }
    }
    console.warn('Packaged binary not found in resources, falling back to python system call');
  }

  // Development mode: run run.py with python
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, '..', 'run.py');
  return { command: pythonCmd, args: [scriptPath] };
}

function initializeUserData() {
  const userHome = app.getPath('home');
  const visibleVaultDir = path.join(userHome, 'SquirrelMap');

  // Support custom vault via SQUIRRELMAP_DATA_DIR if specified
  const userDataDir = process.env.SQUIRRELMAP_DATA_DIR || app.getPath('userData');
  const userIdeasDir = path.join(userDataDir, 'ideas');
  
  if (!fs.existsSync(userIdeasDir)) {
    fs.mkdirSync(userIdeasDir, { recursive: true });
    
    // Try copying default ideas if available
    const defaultIdeasDir = app.isPackaged
      ? path.join(process.resourcesPath, 'ideas-default')
      : path.join(__dirname, '..', 'ideas');
      
    if (fs.existsSync(defaultIdeasDir)) {
      try {
        const files = fs.readdirSync(defaultIdeasDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            fs.copyFileSync(
              path.join(defaultIdeasDir, file),
              path.join(userIdeasDir, file)
            );
          }
        }
        console.log(`Copied initial sample ideas to: ${userIdeasDir}`);
      } catch (err) {
        console.error('Failed to copy sample ideas:', err);
      }
    }
  }

  // Create convenient symlink in user's home folder: ~/SquirrelMap -> userDataDir
  try {
    if (!fs.existsSync(visibleVaultDir)) {
      fs.symlinkSync(userDataDir, visibleVaultDir, 'dir');
      console.log(`Created user-accessible vault link: ${visibleVaultDir} -> ${userDataDir}`);
    }
  } catch (err) {
    // Non-fatal if symlink fails
  }

  return userDataDir;
}

function startBackend() {
  const userDataDir = initializeUserData();
  const { command, args } = getBackendExecutable();

  // Ensure PATH contains user bin directories (~/.local/bin, ~/.platformio_py310/bin, etc.)
  const userHome = app.getPath('home');
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const extraPaths = process.platform === 'win32'
    ? [
        path.join(userHome, 'AppData', 'Roaming', 'Python', 'Scripts'),
        path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'Scripts')
      ]
    : [
        path.join(userHome, '.local', 'bin'),
        path.join(userHome, '.platformio_py310', 'bin'),
        '/usr/local/bin',
        '/usr/bin',
        '/bin'
      ];
  const curPath = process.env.PATH || '';
  const augmentedPath = extraPaths.concat(curPath.split(pathSep)).filter(Boolean).join(pathSep);

  const env = {
    ...process.env,
    PATH: augmentedPath,
    PORT: String(BACKEND_PORT),
    SQUIRRELMAP_DATA_DIR: userDataDir,
    SQUIRRELMAP_FRONTEND_DIR: path.join(__dirname, '..', 'frontend'),
    PYTHONUNBUFFERED: '1'
  };

  const logFile = path.join(userDataDir, 'backend.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  console.log(`Starting SquirrelMap backend: ${command} ${args.join(' ')}`);
  logStream.write(`\n--- SquirrelMap Backend Started ${new Date().toISOString()} ---\n`);

  backendProcess = spawn(command, args, {
    env,
    cwd: userDataDir, // ALWAYS use userDataDir as working directory!
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', (data) => {
    process.stdout.write(data);
    logStream.write(data);
  });

  backendProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
    logStream.write(data);
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to spawn backend process:', err);
    logStream.write(`Process spawn error: ${err.message}\n`);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend process exited with code ${code}, signal ${signal}`);
    logStream.write(`Backend exited with code ${code}, signal ${signal}\n`);
    backendProcess = null;
  });
}

function stopBackend() {
  if (!backendProcess) return;
  console.log('Stopping SquirrelMap backend process...');
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/T', '/F']);
    } else {
      backendProcess.kill('SIGTERM');
      setTimeout(() => {
        if (backendProcess) {
          try { backendProcess.kill('SIGKILL'); } catch (e) {}
        }
      }, 2000);
    }
  } catch (err) {
    console.error('Error stopping backend process:', err);
  }
  backendProcess = null;
}

function pollHealth(url, timeoutMs = 25000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(`${url}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Timeout waiting for backend at ${url}`));
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

async function createMainWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '..', 'assets', 'icon.ico')
    : path.join(__dirname, '..', 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SquirrelMap — 3D Idea Mindmap & Sourcing Graph',
    backgroundColor: '#0a0d14',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  try {
    await pollHealth(BACKEND_URL);
    mainWindow.loadURL(BACKEND_URL);
  } catch (err) {
    console.error('Backend startup error:', err);
    mainWindow.loadURL(`data:text/html;charset=utf-8,
      <body style="background:#0a0d14;color:#f3f4f6;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
        <h2>SquirrelMap Startup Error</h2>
        <p>Could not connect to internal server at ${BACKEND_URL}.</p>
        <p style="color:#f87171;">${err.message}</p>
        <button onclick="location.reload()" style="padding:10px 20px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">Retry</button>
      </body>
    `);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startBackend();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
