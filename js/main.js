const { app, BrowserWindow, ipcMain } = require('electron');
const util = require('util');
const libijs = require('../libijs');

const meaco = require("meaco");

var deviceManager = null;
var device = null;
var deviceName = null;
var mainWindow;

function testPair(device) {
    return meaco(function* doTestAfc() {
        console.log(device);
        const lockdownClient = yield libijs.lockdownd.getClient(device);

        const pairRecord = yield lockdownClient.__usbmuxdClient.readPairRecord(device.udid);
        console.log(pairRecord)

        // TODO: figure out a better way to detect if paired
        const afc = yield libijs.services.getService(device, "afc", lockdownClient);

        if (!afc) {
            console.log('not paired?');
            // do the pairing thing
            const response = yield lockdownClient.pair();
            console.log(response);
            return false;
        }

        return true;
    });
    //const afc = yield libijs.services.getService(device, "afc");
}

function runPair(device) {
    testPair(device)
        .error((e) => {
            console.error('Error:', e);
            process.exit(1);
        })
        .catch((e) => {
            console.error('Caught:', e);
            process.exit(1);
        })
        .done((result) => {
            console.log('Result:', result);
        });
}

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        icon: __dirname + '/assets/icon.png',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
    });

    mainWindow.loadFile('html/index.html');

    mainWindow.webContents.on('found-in-page', (event, result) => {
        mainWindow.send('found-in-page', result);
    });

    deviceManager = libijs.createClient().deviceManager;
    deviceManager.ready(() => {
        device = deviceManager.getDevice();

        libijs.services.getService(device, "afc").done(afcClient => {
            return meaco(function* doAfcExample() {
                const lockdownClient = yield libijs.lockdownd.getClient(device);
                const deviceInfo = yield lockdownClient.getValue(null, null);
                deviceName = deviceInfo['DeviceName'];
            });
        });
    });
};

app.whenReady().then(createWindow);

ipcMain.handle('read-plist', async (event, filePath, name) => {
    libijs.services.getService(device, "afc").done(afcClient => {
        return meaco(function* doAfcExample() {
            event.sender.send('plist-data', {
                file: name,
                data: (yield afcClient.readFile(filePath)).toString(),
            });
        });
    });
});

ipcMain.handle('get-device-name', async (event) => {
    if (deviceName !== null) {
        event.sender.send('device-name', deviceName);
        return;
    }
    device = deviceManager.getDevice();
    if (device === null) {
        event.sender.send('device-name', null);
    }

    libijs.services.getService(device, "afc").done(afcClient => {
        return meaco(function* doAfcExample() {
            const lockdownClient = yield libijs.lockdownd.getClient(device);
            const deviceInfo = yield lockdownClient.getValue(null, null);
            deviceName = deviceInfo['DeviceName'];
            event.sender.send('device-name', deviceName);
        });
    });
});

ipcMain.on('find-in-page', (e, text, options) => {
    const sanitizedOptions = {};
    for (const option of ['forward', 'findNext', 'matchCase']) {
        if (option in options) {
            sanitizedOptions[option] = !!options[option];
        }
    }
    console.log(text, sanitizedOptions);
    const requestId = mainWindow.webContents.findInPage(text, sanitizedOptions);
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