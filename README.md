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