const { app, BrowserWindow, ipcMain } = require('electron');
const libijs = require('../libijs');
const plist = require('plist');
const bplist = require('bplist-parser');
const fs = require('node:fs');

const meaco = require("meaco");

var deviceManager = null;
var isDeviceManagerReady = false;
var onDeviceManagerReady = () => { };

var mainWindow;

// Helper function for whether or not to use test data
function getTestVersion() {
    if (app.isPackaged || process.env.BOOKS_ANNOTATIONS_ENV == null || !process.env.BOOKS_ANNOTATIONS_ENV.startsWith('test')) {
        return null;
    }
    return process.env.BOOKS_ANNOTATIONS_ENV.replace('test', '');
}

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        icon: __dirname + '/assets/icon.png',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        titleBarStyle: 'hidden',
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

ipcMain.handle('read-plist', async (event, filePath, type) => {

    // Return test data
    let testVersion = getTestVersion();
    if (testVersion != null) {
        return new Promise((resolve) => {
            if (filePath === '/Books/Purchases/Purchases.plist') {
                fs.readFile(`./test-files/files-${testVersion}/Purchases.plist`, (err, data) => {
                    if (err) {
                        console.log('failed to load', filePath);
                        return resolve(null);
                    }
                    resolve(plist.parse(data.toString()));
                });
            } else if (filePath === '/Books/com.apple.ibooks-sync.plist') {
                fs.readFile(`./test-files/files-${testVersion}/com.apple.ibooks-sync.plist`, (err, data) => {
                    if (err) {
                        console.log('failed to load', filePath);
                        return resolve(null);
                    }
                    resolve(plist.parse(data.toString()));
                });
            } else if (filePath === '/Books/iBooksData2.plist') {
                fs.readFile(`./test-files/files-${testVersion}/iBooksData2.plist`, (err, data) => {
                    if (err) {
                        console.log('failed to load', filePath);
                        return resolve(null);
                    }
                    resolve(bplist.parseBuffer(data));
                });
            }
        });
    }

    let device = deviceManager.getDevice();

    return new Promise((resolve) => {
        libijs.services.getService(device, "afc").done(afcClient => {
            return meaco(function* doAfcExample() {
                const file = yield afcClient.readFile(filePath);
                if (file == null) {
                    resolve(null);
                } else {
                    if (type === 'binary') {
                        resolve(bplist.parseBuffer(file));
                    } else {
                        resolve(plist.parse(file.toString()));
                    }
                }
            });
        }).error((e) => {
            console.error('Error:', e);
            resolve(null);
        }).catch((e) => {
            event.sender.send('error', 'Please unlock and trust this device.');
            resolve(null);
        });
    });
});

function sendDevice(event) {
    let device = deviceManager.getDevice();
    if (device == null) {
        event.sender.send('debug-log', 'Device is null.');
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
    if (getTestVersion() != null) {
        event.sender.send('device-name', { success: true, name: 'Test Device' });
        return;
    }
    // If it's not ready, then enqueue for after
    if (!isDeviceManagerReady) {
        event.sender.send('debug-log', 'Device manager not read yet, will attempt once finished.');
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