const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isDev = !app.isPackaged && process.env.VITE_DEV_SERVER_URL;
let mainWindow = null;
let rendererDirty = false;
let forceClose = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1620,
    height: 1020,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    roundedCorners: true,
    hasShadow: true,
    autoHideMenuBar: true,
    title: 'SolidGeo · 立体几何',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webgl: true,
      backgroundThrottling: false,
    },
  });

  try {
    if (process.platform === 'win32' && typeof mainWindow.setBackgroundMaterial === 'function') {
      mainWindow.setBackgroundMaterial('acrylic');
    }
  } catch {
    /* Windows 10 fallback is handled by the CSS acrylic layer. */
  }

  mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const sendMaxState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', sendMaxState);
  mainWindow.on('unmaximize', sendMaxState);

  mainWindow.on('close', (event) => {
    if (!forceClose && rendererDirty) {
      event.preventDefault();
      mainWindow.webContents.send('app:request-close');
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.SOLIDGEO_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  if (process.argv.includes('--smoke')) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('载入示例场景'));
              if (button) button.click();
              return Boolean(button);
            })()
          `);
          await new Promise((resolve) => setTimeout(resolve, 2400));
          const info = await mainWindow.webContents.executeJavaScript(`
            (() => {
              const store = window.__solidgeoStore?.getState?.();
              return {
                title: document.title,
                entities: store?.entities?.length ?? -1,
                canvases: [...document.querySelectorAll('canvas[data-viewport]')].map((c) => ({ id: c.dataset.viewport, w: c.width, h: c.height })),
                panels: document.querySelectorAll('.side-panel').length,
                dialogs: document.querySelectorAll('.modal').length,
                bodyText: document.body.innerText.slice(0, 500)
              };
            })()
          `);
          console.log(`SMOKE_RESULT ${JSON.stringify(info)}`);
          const image = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(process.cwd(), 'smoke.png'), image.toPNG());
          console.log(`SMOKE_SCREENSHOT ${path.join(process.cwd(), 'smoke.png')}`);
          forceClose = true;
          app.exit(0);
        } catch (error) {
          console.error('SMOKE_FAILED', error);
          app.exit(1);
        }
      }, 2200);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const singleLock = app.requestSingleInstanceLock();
if (!singleLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('app:set-dirty', (_event, value) => {
  rendererDirty = Boolean(value);
});
ipcMain.handle('app:force-close', () => {
  forceClose = true;
  mainWindow?.close();
  return true;
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('file:save', async (_event, options) => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options?.title || '保存文件',
    defaultPath: options?.defaultPath || 'SolidGeo.geojson',
    filters: options?.filters || [{ name: '所有文件', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const data = options?.encoding === 'base64'
    ? Buffer.from(String(options.data || '').replace(/^data:[^,]*,/, ''), 'base64')
    : String(options?.data ?? '');
  await fs.promises.writeFile(result.filePath, data);
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('file:open', async (_event, options) => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options?.title || '打开文件',
    properties: ['openFile'],
    filters: options?.filters || [{ name: '所有文件', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  const data = await fs.promises.readFile(filePath, 'utf8');
  return { canceled: false, filePath, data };
});
