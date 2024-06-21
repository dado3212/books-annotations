# Books Annotations
Code for extracting annotations and highlights from the iBooks/Books app on iPhone and iPad

1. Download iExplorer - https://macroplant.com/iexplorer/download/mac/complete/4.6.0.
2. Plug in your iPhone/iPad.
3. Copy [iPhone Name] > Media > Books > iBooksData2.plist to your Desktop.
4. Run `main.py`.

The iBooksData2.plist seems to only have old annotations, for me up to Nov 2018.  
The recent data is in [iPhone Name] > Media > Books > com.apple.ibooks-sync.plist.  
Also download [iPhone Name] > Media > Books > Sync > Books.plist.
[iPhone Name] > Media > Books > Purchases > Purchases.plist.

Also handles sorting annotations by location (location is Epub CFI like this" 'epubcfi(/6/304[id167]!/4[4F1KC0-7077b85d15a1406085690fde3201ca05]/710/2/1,:0,:23)'), you can sort them [like this](https://gist.github.com/mlitwin/1a5471ae2897c360914247bc8db6b57a).

## Using Electron
https://nodejs.org/en/download/package-manager
`brew install node@20`

* `node -v`: `v20.14.0`
* `npm -v`: `10.7.0`

Quick start - https://www.electronjs.org/docs/latest/tutorial/quick-start

`npm start`

```
python3 -m venv venv
source venv/bin/activate
pip install pymobiledevice3
```

```
pip freeze > requirements.txt
```

## libimobiledevice
`brew install libimobiledevice`
Install ifuse using this gist for Apple Silicon (M3 Macbook Pro) - https://gist.github.com/cbatson/01a20a44c5c1a70ed3218c32d643e65d
`brew install --cask macfuse`
`brew install gromgit/fuse/ifuse-mac`
/opt/homebrew/Cellar/libimobiledevice/1.3.0_3

`idevicename`
`idevicepair pair`

```
pymobiledevice3 usbmux list
[
    {
        "BuildVersion": "21F90",
        "ConnectionType": "USB",
        "DeviceClass": "iPhone",
        "DeviceName": "Mercury",
        "Identifier": "<>",
        "ProductType": "iPhone13,3",
        "ProductVersion": "17.5.1",
        "UniqueDeviceID": "<>"
    }
]
pymobiledevice3 afc shell
pymobiledevice3 afc pull Books/com.apple.ibooks-sync.plist com.apple.ibooks-sync.plist 
pymobiledevice3 afc pull Books/Purchases/Purchases.plist Purchases.plist
# Can use this to fetch information
pymobiledevice3 afc ls Books/Purchases/b05fa8d59ac2dca7e59072dc006314baMdU2kFUVslo4Ogo1AAAJ.epub/OEBPS/
9780593135211.opf has proper title/author info (and page count?)
```

## PymobileDevice code that should be adapted

Searching the magic key 'CFA6LPAA' gave me https://github.com/mceSystems/libijs/ and https://github.com/appium/appium-ios-device, both of which are attempts to basically port this to Node.JS. I am going to take the bits I need. Apple, for the love of god, release an actual API for this on MacOS you monsters.

https://github.com/doronz88/pymobiledevice3/blob/master/pymobiledevice3/cli/afc.py#L31-L32
AfcService(lockdown=service_provider).pull(remote_file, local_file)

class AfcService(LockdownService):
    SERVICE_NAME = 'com.apple.afc'
    RSD_SERVICE_NAME = 'com.apple.afc.shim.remote'

    def __init__(self, lockdown: LockdownServiceProvider, service_name: str = None):
        if service_name is None:
            if isinstance(lockdown, LockdownClient):
                service_name = self.SERVICE_NAME
            else:
                service_name = self.RSD_SERVICE_NAME
        super().__init__(lockdown, service_name)
        self.packet_num = 0

    def pull(self, relative_src, dst, callback=None, src_dir=''):
        src = posixpath.join(src_dir, relative_src)
        if callback is not None:
            callback(src, dst)

        src = self.resolve_path(src)

        if not self.isdir(src):
            # normal file
            if os.path.isdir(dst):
                dst = os.path.join(dst, os.path.basename(relative_src))
            with open(dst, 'wb') as f:
                f.write(self.get_file_contents(src))
            os.utime(dst, (os.stat(dst).st_atime, self.stat(src)['st_mtime'].timestamp()))
        else:
            # directory
            dst_path = pathlib.Path(dst) / os.path.basename(relative_src)
            dst_path.mkdir(parents=True, exist_ok=True)

            for filename in self.listdir(src):
                src_filename = posixpath.join(src, filename)
                dst_filename = dst_path / filename

                src_filename = self.resolve_path(src_filename)

                if self.isdir(src_filename):
                    dst_filename.mkdir(exist_ok=True)
                    self.pull(src_filename, str(dst_path), callback=callback)
                    continue

                self.pull(src_filename, str(dst_path), callback=callback)

    @path_to_str()
    def isdir(self, filename: str) -> bool:
        stat = self.stat(filename)
        return stat.get('st_ifmt') == 'S_IFDIR'

    @path_to_str()
    def stat(self, filename: str):
        try:
            stat = list_to_dict(
                self._do_operation(afc_opcode_t.GET_FILE_INFO, afc_stat_t.build({'filename': filename})))
        except AfcException as e:
            if e.status != afc_error_t.READ_ERROR:
                raise
            raise AfcFileNotFoundError(e.args[0], e.status) from e

        stat['st_size'] = int(stat['st_size'])
        stat['st_blocks'] = int(stat['st_blocks'])
        stat['st_mtime'] = int(stat['st_mtime'])
        stat['st_birthtime'] = int(stat['st_birthtime'])
        stat['st_nlink'] = int(stat['st_nlink'])
        stat['st_mtime'] = datetime.fromtimestamp(stat['st_mtime'] / (10 ** 9))
        stat['st_birthtime'] = datetime.fromtimestamp(stat['st_birthtime'] / (10 ** 9))
        return stat

    @path_to_str()
    def resolve_path(self, filename: str):
        info = self.stat(filename)
        if info['st_ifmt'] == 'S_IFLNK':
            target = info['LinkTarget']
            if not target.startswith('/'):
                # relative path
                filename = posixpath.join(posixpath.dirname(filename), target)
            else:
                filename = target
        return filename

    @path_to_str()
    def get_file_contents(self, filename):
        filename = self.resolve_path(filename)
        info = self.stat(filename)

        if info['st_ifmt'] != 'S_IFREG':
            raise AfcException(f'{filename} isn\'t a file', afc_error_t.INVALID_ARG)

        h = self.fopen(filename)
        if not h:
            return
        d = self.fread(h, int(info['st_size']))
        self.fclose(h)
        return d

    def _do_operation(self, opcode: afc_opcode_t, data: bytes = b''):
        self._dispatch_packet(opcode, data)
        status, data = self._receive_data()

        exception = AfcException
        if status != afc_error_t.SUCCESS:
            if status == afc_error_t.OBJECT_NOT_FOUND:
                exception = AfcFileNotFoundError

            raise exception(f'opcode: {opcode} failed with status: {status}', status)

        return data

AFCMAGIC = b'CFA6LPAA'

afc_header_t = Struct(
    'magic' / Const(AFCMAGIC),
    'entire_length' / Int64ul,
    'this_length' / Int64ul,
    'packet_num' / Int64ul,
    'operation' / afc_opcode_t,
    '_data_offset' / Tell,
)

afc_stat_t = Struct(
    'filename' / CString('utf8'),
)

afc_opcode_t = Enum(Int64ul,
                    STATUS=0x00000001,
                    DATA=0x00000002,  # Data */
                    READ_DIR=0x00000003,  # ReadDir */
                    READ_FILE=0x00000004,  # ReadFile */
                    WRITE_FILE=0x00000005,  # WriteFile */
                    WRITE_PART=0x00000006,  # WritePart */
                    TRUNCATE=0x00000007,  # TruncateFile */
                    REMOVE_PATH=0x00000008,  # RemovePath */
                    MAKE_DIR=0x00000009,  # MakeDir */
                    GET_FILE_INFO=0x0000000a,  # GetFileInfo */
                    GET_DEVINFO=0x0000000b,  # GetDeviceInfo */
                    WRITE_FILE_ATOM=0x0000000c,  # WriteFileAtomic (tmp file+rename) */
                    FILE_OPEN=0x0000000d,  # FileRefOpen */
                    FILE_OPEN_RES=0x0000000e,  # FileRefOpenResult */
                    READ=0x0000000f,  # FileRefRead */
                    WRITE=0x00000010,  # FileRefWrite */
                    FILE_SEEK=0x00000011,  # FileRefSeek */
                    FILE_TELL=0x00000012,  # FileRefTell */
                    FILE_TELL_RES=0x00000013,  # FileRefTellResult */
                    FILE_CLOSE=0x00000014,  # FileRefClose */
                    FILE_SET_SIZE=0x00000015,  # FileRefSetFileSize (ftruncate) */
                    GET_CON_INFO=0x00000016,  # GetConnectionInfo */
                    SET_CON_OPTIONS=0x00000017,  # SetConnectionOptions */
                    RENAME_PATH=0x00000018,  # RenamePath */
                    SET_FS_BS=0x00000019,  # SetFSBlockSize (0x800000) */
                    SET_SOCKET_BS=0x0000001A,  # SetSocketBlockSize (0x800000) */
                    FILE_LOCK=0x0000001B,  # FileRefLock */
                    MAKE_LINK=0x0000001C,  # MakeLink */
                    SET_FILE_TIME=0x0000001E,  # set st_mtime */
                    )

    def _dispatch_packet(self, operation, data, this_length=0):
        afcpack = Container(magic=AFCMAGIC,
                            entire_length=afc_header_t.sizeof() + len(data),
                            this_length=afc_header_t.sizeof() + len(data),
                            packet_num=self.packet_num,
                            operation=operation)
        if this_length:
            afcpack.this_length = this_length
        header = afc_header_t.build(afcpack)
        self.packet_num += 1 # initialized at 0
        self.service.sendall(header + data)

    SERVICE_NAME = 'com.apple.afc'
    RSD_SERVICE_NAME = 'com.apple.afc.shim.remote'

    def __init__(self, lockdown: LockdownServiceProvider, service_name: str = None):
        if service_name is None:
            if isinstance(lockdown, LockdownClient):
                service_name = self.SERVICE_NAME
            else:
                service_name = self.RSD_SERVICE_NAME
        super().__init__(lockdown, service_name)
        self.packet_num = 0

### Service
    def ssl_start(self, certfile, keyfile=None) -> None:
        self.socket = create_context(certfile, keyfile=keyfile).wrap_socket(self.socket)


    def sendall(self, data: bytes) -> None:
        try:
            self.socket.sendall(data)
        except ssl.SSLEOFError as e:
            raise ConnectionTerminatedError from e