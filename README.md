# Books Annotations
Code for extracting annotations and highlights from the iBooks/Books app on iPhone and iPad

1. Download iExplorer - https://macroplant.com/iexplorer/download/mac/complete/4.6.0.
2. Plug in your iPhone/iPad.
3. Copy [iPhone Name] > Media > Books > iBooksData2.plist to your Desktop.
4. Run `main.py`.

The iBooksData2.plist seems to only have old annotations, for me up to Nov 2018.  
The recent data is in [iPhone Name] > Media > Books > com.apple.ibooks-sync.plist.  
Also download [iPhone Name] > Media > Books > Sync > Books.plist.

Also handles sorting annotations by location (location is Epub CFI like this" 'epubcfi(/6/304[id167]!/4[4F1KC0-7077b85d15a1406085690fde3201ca05]/710/2/1,:0,:23)'), you can sort them [like this](https://gist.github.com/mlitwin/1a5471ae2897c360914247bc8db6b57a).

## Using Electron
https://nodejs.org/en/download/package-manager
`brew install node@20`

* `node -v`: `v20.14.0`
* `npm -v`: `10.7.0`

Quick start - https://www.electronjs.org/docs/latest/tutorial/quick-start
