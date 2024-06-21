const { app, BrowserWindow, ipcMain } = require('electron');
const util = require('util');
const libijs = require('../libijs');

const meaco = require("meaco");

var deviceManager = null;
var isDeviceManagerReady = false;
var onDeviceManagerReady = () => { };

var mainWindow;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        icon: __dirname + '/assets/icon.png',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile('html/index.html');

    // Forward found-in-page for the 1/x UI appearance
    mainWindow.webContents.on('found-in-page', (_, result) => {
        mainWindow.send('found-in-page', result);
    });

    // Save the device manager
    deviceManager = libijs.createClient().deviceManager;
    deviceManager.ready(() => {
        isDeviceManagerReady = true;
        onDeviceManagerReady();
    });
};

app.whenReady().then(createWindow);

ipcMain.handle('read-plist', async (event, filePath, name) => {
    let device = deviceManager.getDevice();

    libijs.services.getService(device, "afc").done(afcClient => {
        return meaco(function* doAfcExample() {
            const file = yield afcClient.readFile(filePath);
            if (file == null) {
                event.sender.send('plist-data', {
                    file: name,
                    data: null,
                });
            } else {
                event.sender.send('plist-data', {
                    file: name,
                    data: file.toString(),
                });
            }
        });
    }).error((e) => {
        console.error('Error:', e);
    }).catch((e) => {
        event.sender.send('error', 'Please unlock and trust this device.' );
    });
});

function sendDevice(event) {
    let device = deviceManager.getDevice();
    if (device == null) {
        event.sender.send('device-name', { success: false, message: 'No device found. Please attach device.' });
        return;
    }

    meaco(function* doAfcExample() {
        const lockdownClient = yield libijs.lockdownd.getClient(device, "libijs", false);
        const deviceInfo = yield lockdownClient.getValue(null, null);
        return deviceInfo;
    }).done(deviceInfo => {
        event.sender.send('device-name', { success: true, name: deviceInfo['DeviceName'] });
    }).error((e) => {
        console.error('Error:', e);
    }).catch((e) => {
        console.log(e);
        event.sender.send('device-name', { success: false, message: 'No device found. Please attach device.' });
    });
}

ipcMain.handle('fetch-devices', async (event) => {
    // If it's not ready, then enqueue for after
    if (!isDeviceManagerReady) {
        onDeviceManagerReady = () => {
            sendDevice(event)
        };
        return;
    } else {
        sendDevice(event);
    }
});

ipcMain.on('find-in-page', (e, text, options) => {
    const sanitizedOptions = {};
    for (const option of ['forward', 'findNext', 'matchCase']) {
        if (option in options) {
            sanitizedOptions[option] = !!options[option];
        }
    }
    const requestId = mainWindow.webContents.findInPage(text, options);
    e.returnValue = requestId;
});

ipcMain.on('stop-find-in-page', (e, action) => {
    const validActions = [
        'clearSelection',
        'keepSelection',
        'activateSelection',
    ];
    if (validActions.includes(action)) {
        mainWindow.webContents.stopFindInPage(action);
    }
    e.returnValue = null;
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