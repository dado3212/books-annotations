const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const libijs = require('../libijs-master');

const meaco = require("meaco");
const JarvisEmitter = require("jarvis-emitter");
const fs = require("fs-extra");

const { lockdownd, services } = libijs;
const { getService, MCInstall } = services;

function testPair (device) {
  return meaco(function* doTestAfc() {
    console.log(device);
    const lockdownClient = yield libijs.lockdownd.getClient(device);

    const pairRecord = yield lockdownClient.__usbmuxdClient.readPairRecord(device.udid);
    console.log(pairRecord)
    
    // TODO: figure out a better way to detect if paired
    const MCInstall = yield getService(device, 'MCInstall', lockdownClient);

    if (!MCInstall) {
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

function runPair (device) {
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
		// process.exit(result ? 0 : 1);
	});
}

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

    // const deviceManager = libijs.createClient().deviceManager;
    // deviceManager.ready(() => {
    // console.log('ready')
    // const device = deviceManager.getDevice();
    // if (!device) {
    //     deviceManager.attached(runPair);
    // } else {
    //     runPair(device);
    // }
    // });
};

app.whenReady().then(createWindow);

ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(options);
    return result;
});

const afcExample = function afcExample(afcClient) {
    return meaco(function* doAfcExample() {
        // List a remote dir
        console.log((yield afcClient.readFile("/Books/com.apple.ibooks-sync.plist")).toString());
        // yield afcClient.walk("/", false, true)
        //     .item((item) => { console.log(`${item.relativeToRoot} - ${item.stats.st_size} bytes`); });

        // Download a file
        // yield afcClient.downloadFile("DCIM/100APPLE/IMG_0001.JPG", "./IMG_0001.JPG");

        // // Use the stream api to read a file
        // console.log("\nVoiceMemos.plist:");
        // const remoteFile = yield afcClient.openFileAsReadableStream("iTunes_Control/iTunes/VoiceMemos.plist");
        // const fileReadDone = new JarvisEmitter();
        // remoteFile
        //     .on("data", (data) => {
        //         console.log(data.toString());
        //     })
        //     .on("end", () => {
        //         fileReadDone.callDone();
        //     });
        // yield fileReadDone;

        // Disconnect from the afcd service
        yield afcClient.close();
    });
};

ipcMain.handle('run-command', async (event, command) => {

    const deviceManager = libijs.createClient().deviceManager;
    console.log(deviceManager);
    deviceManager.ready(() => {
        const device = deviceManager.getDevice();
        console.log('hit');
        libijs.services.getService(device, "afc").done(afcExample);
    });

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