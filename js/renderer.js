const { ipcRenderer } = require('electron');
var fs = require('fs');
var plist = require('plist');

var listOfBooks = {};

// Adapted from https://gist.github.com/mlitwin/1a5471ae2897c360914247bc8db6b57a
function cfiToSortableValue(cfi) {
    cfi = cfi.replace('epubcfi(', '').replace(')', '');
    cfi = cfi.replace(/\[[^\]]*\]/g, '');

    return cfi.split(/\D+/).filter(x => x !== '').map(Number);
}

ipcRenderer.on('plist-data', async function (_, info) {
    console.log(info);

    if (info.file == 'books') {
        let parsed = plist.parse(info.data)['Books'];
        console.log(plist.parse(info.data));

        parsed.forEach(book => {
            listOfBooks[book['Package Hash']] = {
                'name': book['Name'],
                'author': book['Artist'],
                'annotations': [],
            }
        });
        await ipcRenderer.invoke('read-plist', '/Books/com.apple.ibooks-sync.plist', 'annotations');
    } else if (info.file == 'annotations') {
        let parsed = plist.parse(info.data);

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
                'note': ('annotationNote' in bookmark) ? bookmark['annotationNote'] : null,
                'chapter': ('futureProofing5' in bookmark) ? bookmark['futureProofing5'] : null,
            })
        });

        populate();
    }
});

async function populate() {
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
                        <span class="name">${listOfBooks[bookHash]['name']}</span>
                        <span class="author">by ${listOfBooks[bookHash]['author']}</span>
                        <span class="count">${listOfBooks[bookHash]['annotations'].length} notes</span>
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
                            <div class="info">
                            </div>
                        </div>
                    `);
            if (annotation['chapter'] !== null) {
                annotationElement.find('.info').append($(`<span class="chapter">${annotation['chapter']}</span><span class="divider">·</span>`))
            }
            let formattedDate = (new Date(annotation['date'] * 1000)).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            annotationElement.find('.info').append($(`<span class="date">${formattedDate}</span>`))
            annotationsList.append(annotationElement);
        });
    });
}

ipcRenderer.on('device-name', function (_, name) {
    document.getElementById('refresh').disabled = false;

    $('#devices button.device').remove();

    if (name === null) {
        $('#devices span')[0].innerHTML = 'No device found. Please attach device.';
    } else {
        $('#devices span')[0].innerHTML = 'Select device.';
        const button = $(`
            <button class="device">
                ${name}
            </button>
        `);
        button.on('click', async () => {
            await ipcRenderer.invoke('read-plist', '/Books/Purchases/Purchases.plist', 'books');
        });
        $('#devices').append(button);
    }
});

async function doStuff() {
    document.getElementById('refresh').disabled = true;
    await ipcRenderer.invoke('get-device-name');
}

$(document).ready(async () => {
    $('#refresh').on('click', doStuff);
    doStuff();
});