const { ipcRenderer } = require('electron');
var fs = require('fs');
var plist = require('plist');

var listOfBooks = {};

function handleBooksList(plistPath, callback) {
    fs.readFile(plistPath, function(err, data){
        let parsed = plist.parse(data.toString())['Books'];

        parsed.forEach(book => {
            listOfBooks[book['Package Hash']] = {
                'name': book['Name'],
                'author': book['Artist'],
                'annotations': [],
            }
        });

        callback();
    });
}

function handleAnnotationsList(plistPath, callback) {
    fs.readFile(plistPath, function(err, data){
        let parsed = plist.parse(data.toString());
        console.log(parsed);

        let bookmarks = parsed[Object.keys(parsed)[0]]['Bookmarks'];

        bookmarks.forEach(bookmark => {
            if (!('annotationSelectedText' in bookmark)) {
                return;
            }
            let text = bookmark['annotationSelectedText']
            if ('annotationRepresentativeText' in bookmark && bookmark['annotationRepresentativeText'].includes(text)) {
                text = bookmark['annotationRepresentativeText']
            }
            hash = bookmark['annotationAssetID']

            if (!(hash in listOfBooks)) {
                listOfBooks[hash] = {
                    'name': '[?] ' + hash,
                    'author': 'Unknown',
                    'annotations': [], 
                }
            }
            listOfBooks[hash]['annotations'].push({
                'date': bookmark["annotationCreationDate"],
                'text': text,
                'location': bookmark['annotationLocation'],
                'other': bookmark,
            })
        });

        callback();
    });
}

// Adapted from https://gist.github.com/mlitwin/1a5471ae2897c360914247bc8db6b57a
function cfiToSortableValue(cfi) {
    cfi = cfi.replace('epubcfi(', '').replace(')', '');
    cfi = cfi.replace(/\[[^\]]*\]/g, '');
    
    return cfi.split(/\D+/).filter(x => x !== '').map(Number);
}

$(document).ready(() => {
    handleBooksList('/Users/abeals/Git/books-annotations/python/Books.plist', () => {
        handleAnnotationsList('/Users/abeals/Git/books-annotations/python/com.apple.ibooks-sync.plist', () => {
            //  Post-process (sort by location, remove those with no annotations)
            console.log(listOfBooks);
            Object.keys(listOfBooks).forEach(bookHash => {
                if (listOfBooks[bookHash]['annotations'].length == 0) {
                    delete listOfBooks[bookHash]
                    return;
                }
                listOfBooks[bookHash]['annotations'].sort((a, b) => {
                    let indexA = cfiToSortableValue(a['location']);
                    let indexB = cfiToSortableValue(b['location']);
                    for (let i = 0; i < Math.min(indexA.length, indexB.length); i++) {
                        if (indexA[i] !== indexB[i]) {
                            return indexA[i] - indexB[i];
                        }
                    }
                    return indexA.length - indexB.length;
                });
            });
            console.log(listOfBooks);
            let booksList = $('.books');
            
            Object.keys(listOfBooks).forEach(bookHash => {
                let element = $(`
                    <div class="book" data-hash="${bookHash}">
                        <span class="name">${listOfBooks[bookHash]['name']}</span>
                        <span class="author">${listOfBooks[bookHash]['author']}</span>
                    </div>
                `);
                    
                booksList.append(element);
            });
        });
//   $('.import #books').on('click', async () => {
//     const options = {
//         properties: ['openFile'],
//         filters: [
//             { name: 'Plist Files', extensions: ['plist'] },
//           ],
//     };
//     try {
//         const result = await ipcRenderer.invoke('show-open-dialog', options);
//         console.log(result);
//         handlePlist(result.filePaths[0]);
//     } catch (error) {
//         console.error('Failed to open dialog:', error);
//     }
  });
});