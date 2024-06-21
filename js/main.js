const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const libijs = require('../libijs-master');

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          enableRemoteModule: true,
        },
    });

    win.webContents.openDevTools();


    win.loadFile('html/index.html');
};

app.whenReady().then(createWindow);

ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(options);
    return result;
});

ipcMain.handle('run-command', async (event, command) => {
    try {
        const { stdout, stderr } = await exec(command);
        return { error: false, stdout, stderr };
    } catch (error) {
        return { error: true, stdout: error.stdout, stderr: error.stderr };
    }
  });

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});