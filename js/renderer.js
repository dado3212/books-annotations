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
                    'name': hash,
                    'author': 'Unknown',
                    'annotations': [], 
                }
            }
            listOfBooks[hash]['annotations'].push({
                'date': bookmark["annotationCreationDate"],
                'text': text,
                'location': bookmark['annotationLocation'],
                'style': bookmark['annotationStyle'],
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

async function doStuff() {
    document.getElementById('refresh').disabled = true;
    const result = await ipcRenderer.invoke('run-command', 'idevicename');
    document.getElementById('refresh').disabled = false;

    $('#devices button.device').remove();

    if (result.error && result.stderr.includes('No device found.')) {
        $('#devices span')[0].innerHTML = 'No device found. Please attach device.';
    } else {
        $('#devices span')[0].innerHTML = 'Select device.';
        const button = $(`
            <button class="device">
                ${result.stdout}
            </button>
        `);
        button.on('click', async () => {
            const result = await ipcRenderer.invoke('run-command', 'idevicepair pair');
            if (result.error && result.stdout.includes('Please accept the trust dialog')) {
                $('#devices span')[0].innerHTML = 'Please unlock the device and accept the trust dialog, then click again.';
            } else if (result.error && result.stdout.includes('because a passcode is set')) {
                $('#devices span')[0].innerHTML = 'Please unlock the device, then click again.';
            } else if (!result.error && result.stdout.includes('SUCCESS')) {
                $('#devices span')[0].innerHTML = 'Paired with device.';
                const result = await ipcRenderer.invoke('run-command', 'source venv/bin/activate; pymobiledevice3 afc pull Books/com.apple.ibooks-sync.plist annotations.plist; pymobiledevice3 afc pull Books/Purchases/Purchases.plist books.plist; deactivate');

                handleBooksList('/Users/abeals/Git/books-annotations/books.plist', () => {
                    handleAnnotationsList('/Users/abeals/Git/books-annotations/annotations.plist', () => {
                        //  Post-process (sort by location, remove those with no annotations)
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
            
                        let booksList = $('.books');
                        let annotationsList = $('.annotations');
            
                        console.log(listOfBooks);
                        
                        Object.keys(listOfBooks).sort((a, b) => listOfBooks[b]['annotations'].length - listOfBooks[a]['annotations'].length).forEach(bookHash => {
                            let bookElement = $(`
                                <div class="book" data-hash="${bookHash}">
                                    <span class="count">${listOfBooks[bookHash]['annotations'].length}</span>
                                    <span class="name">${listOfBooks[bookHash]['name']}</span>
                                    <span class="author">${listOfBooks[bookHash]['author']}</span>
                                </div>
                            `);
            
                            bookElement.on('click', (e) => {
                                // Highlight the current book
                                $(`.book.selected`).removeClass('selected');
                                bookElement.addClass('selected');
                                
                                // Make the relevant annotations visible
                                let hash = bookElement.data('hash');
                                $(`.annotation`).addClass('hidden');
                                $(`.annotation[data-hash="${hash}"]`).removeClass('hidden');
                            });
                                
                            booksList.append(bookElement);
            
                            listOfBooks[bookHash]['annotations'].forEach(annotation => {
                                let annotationElement = $(`
                                    <div class="annotation hidden style-${annotation['style']}" data-hash="${bookHash}">
                                        <mark class="text">${annotation['text']}</mark>
                                    </div>
                                `);
                                annotationsList.append(annotationElement);
                            });
                        });
                    });
                });
            }
            console.log(result);
        });
        $('#devices').append(button);
    }
}

$(document).ready(async () => {
    $('#refresh').on('click', doStuff);
    doStuff();
});