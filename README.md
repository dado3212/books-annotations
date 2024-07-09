# <img src="/assets/icon.png?raw=true" width="30" alt="Logo"/> Books Annotations

The Books app on iPhone (previously named iBooks) allows you to highlight text and leave notes. Unfortunately there's no good way to export these, as the information isn't stored in the ePubs themselves. The information <b>is</b> saved in the Media folder though, which is accessible from iPhones over USB. I built an app to read this into a searchable UI without having to install a bunch of software or pore through full backups. You can download the [MacOS Electron app here](https://github.com/dado3212/books-annotations/releases/latest).

<img width="1112" alt="Screenshot of application showing off search and annotation capabilities" src="https://github.com/dado3212/books-annotations/assets/8919256/e140e913-c28f-45b7-b90b-541804f3acb7">

## Books App Information

If you're trying to do something similar, I hope this code is useful even if you go for a different export approach. You can do this manually with [iExplorer]( https://macroplant.com/iexplorer/download/mac/complete/4.6.0) or libraries based on [libimobiledevice](https://libimobiledevice.org/). I found [pymobiledevice3](https://github.com/doronz88/pymobiledevice3) to be the easiest to install, and it provides a great Python API.

There's two main files that my code reads from.
1. `Books/com.apple.ibooks-sync.plist` or **[iPhone Name] > Media > Books > com.apple.ibooks-sync.plist**  
This is the list of annotations and notes. The key bits are the `annotationAssetID` (which maps to a book), `annotationLocation` which is an ePub CFI that corresponds to a location in the book, `annotationSelectedText`, the actual text, and `futureProofing5` which *sometimes* contains the chapter name.

```
<dict>
  <key>annotationAssetID</key>            <string>AA46A0AF12567551A8088BF581281408</string>
  <key>annotationCreationDate</key>       <integer>1585671309</integer>
  <key>annotationCreatorIdentifier</key>  <string>com~apple~iBooks</string>
  <key>annotationDeleted</key>            <integer>0</integer>
  <key>annotationIsUnderline</key>        <integer>0</integer>
  <key>annotationLocation</key>           <string>epubcfi(/6/32[id206]!/4[DB7S0-7077b85d15a1406085690fde3201ca05]/378,/2/1:0,/4/1:24)</string>
  <key>annotationModificationDate</key>   <integer>1585671309</integer>
  <key>annotationSelectedText</key>       <string>You I will protect, little one, Kaladin thought at the child. I will protect them all.</string>
  <key>annotationStyle</key>              <integer>3</integer>
  <key>annotationType</key>               <integer>2</integer>
  <key>annotationUuid</key>               <string>3B5BCC1C-4DC8-4FB1-AD37-EA43836D7088</string>
  <key>futureProofing11</key>             <string>607364109.760368</string>
  <key>futureProofing5</key>              <string>7 A Watcher at the Rim</string>
  <key>futureProofing6</key>              <string>607364109.595078</string>
  <key>futureProofing7</key>              <string>{0, 86}</string>
  <key>futureProofing9</key>              <string>1</string>
  <key>plAbsolutePhysicalLocation</key>   <integer>0</integer>
  <key>plLocationRangeEnd</key>           <integer>0</integer>
  <key>plLocationRangeStart</key>         <integer>15</integer>
  <key>plUserData</key>  <data>
  YnBsaXN0MDDWAQIDBAUGBwgMDRscVWNsYXNzVXN1cGVy
  W3N0YXJ0T2Zmc2V0V2VuZFBhdGhZZW5kT2Zmc2V0WXN0
  YXJ0UGF0aF5CS0VwdWJMb2NhdGlvbtIJAQoLV29yZGlu
  YWwQD1pCS0xvY2F0aW9uIgAAAACjDhUZ0w8QERITFFd0
  YWdOYW1lWWNsYXNzTmFtZVVpbmRleFFwVmluZGVudBEB
  etMPEBEWFxhRaVhjYWxpYnJlMxAD0REaEAEiQcAAAKMd
  Hh/TDxAREhMU0w8QERYXGtERGggVGyEtNT9JWF1lZ3J3
  e4KKlJqco6atr7i6vb/EyM/WAAAAAAAAAQEAAAAAAAAA
  IAAAAAAAAAAAAAAAAAAAANk=
  </data>
</dict>
```
2. `/Books/Purchases/Purchases.plist` or **[iPhone Name] > Media > Books > Purchases > Purchases.plist**  
This is the list of Books that are installed on the device. It has book hashes (`Package Hash`) that can be used to map from the `annotationAssetID` field in the annotations file into an author and name. 
```
<dict>
  <key>Artist</key>              <string>astolat</string>
  <key>Inserted-By-iBooks</key>  <true/>
  <key>Name</key>                <string>Heal Thyself</string>
  <key>Package Hash</key>        <string>018FAD7D0C8E0A9B6B0AB9058D59880D</string>
  <key>Path</key>                <string>Heal Thyself.epub</string>
  <key>Persistent ID</key>       <string>6C60A4726577FBC9</string>
  <key>importDate</key>          <date>2022-08-23T01:00:18Z</date>
</dict>
```

There are some additional files that could be useful:

3. `/Books/iBooksData2.plist`  
This seems to have old annotations, for me only going up to Nov 2018.
4. `Books/Sync/Books.plist`  
Seems to have a truncated version of the Purchases.plist file (maybe also out of date, circa 2021).
5. `Books/Purchases/<filepath>/OEBPS/*.opf`  
Taking the `filepath` from the `/Books/Purchases/Purchases.plist` can let you pull the actual author/title directly from the ePub, which isn't always well-maintained by the `Purchases.plist` file. This felt like overkill so I didn't do this in the app, but it could be added in the future.

## Building The App
I built this using `node -v: v20.14.0` and `npm -v: 10.7.0`.

* `npm run start` runs the app locally
* `npm run build` builds the Mac app in `release-builds`. I took the resulting `.app` and zipped it for the release version.

## Testing The App

You should go through a flow with a real phone, using `npm run start`. You can also use the three testing environments, and confirm they match the uploaded screenshots in those files, in light and dark mode.
* `npm run test1` - tests my production environment, tests all colors, styles, notes
* `npm run test2` - test some alternate data formats users have reported, other languages
* `npm run test3` - test no annotations

## Thanks

I sort the annotations by location in the book using the Epub CFI's like `epubcfi(/6/304[id167]!/4[4F1KC0-7077b85d15a1406085690fde3201ca05]/710/2/1,:0,:23)`, thanks @mlitwin for   [his Gist detailing how to sort them](https://gist.github.com/mlitwin/1a5471ae2897c360914247bc8db6b57a).

This uses an adapted version of [libimobiledevice](https://libimobiledevice.org/), courtesy of a prior attempt to port to NodeJS in https://github.com/mceSystems/libijs/ (the magic key 'CFA6LPAA' was the trick to finding the other usbmux Node implementations). This and the aforementioned [pymobiledevice3](https://github.com/doronz88/pymobiledevice3) library were both very helpful.
