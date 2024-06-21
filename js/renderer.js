const { ipcRenderer } = require('electron');
var plist = require('plist');
const ElectronFindInPage = require('electron-find').FindInPage;

var listOfBooks = {};
var currentHash = '';
var findInPage;

// Shim to expose webContents functionality to electron-find without @electron/remote
const webContentsShim = {
    findInPage: (text, options = {}) =>
        ipcRenderer.sendSync('find-in-page', text, options),
    stopFindInPage: (action) => {
        ipcRenderer.sendSync('stop-find-in-page', action);
    },
    on: (eventName, listener) => {
        if (eventName === 'found-in-page') {
            // Tunnel with main.js
            ipcRenderer.on('found-in-page', (_, result) => {
                listener({ sender: this }, result);
            });
        }
    },
};

class FindInPage extends ElectronFindInPage {
    constructor(options = {}) {
        super(webContentsShim, options);
    }

    openFindWindow() {
        super.openFindWindow();
    }
}


// Adapted from https://gist.github.com/mlitwin/1a5471ae2897c360914247bc8db6b57a
function cfiToSortableValue(cfi) {
    cfi = cfi.replace('epubcfi(', '').replace(')', '');
    cfi = cfi.replace(/\[[^\]]*\]/g, '');

    return cfi.split(/\D+/).filter(x => x !== '').map(Number);
}

// Should make this use await/async pattern, but meaco makes this annoying, so
// I haven't done it yet.
ipcRenderer.on('plist-data', async function (_, info) {

    if (info.file == 'books') {
        let parsed = plist.parse(info.data)['Books'];

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

function updateAnnotationsForSearch() {
    // Get the search value
    const search = $('#search').val();
    // Iterate over all of the current annotations and set the status
    document.querySelectorAll(`.annotation[data-hash="${currentHash}"]`).forEach(e => {
        if (e.querySelector('mark.text').textContent.toLowerCase().includes(search.toLowerCase()) ||
            (e.querySelector('.note') && e.querySelector('.note').textContent.toLowerCase().includes(search.toLowerCase()))) {
            e.classList.remove('hidden');
        } else {
            e.classList.add('hidden');
        }
    });
    // If there aren't any visible, show the 'no results' text
    if (document.querySelectorAll('.annotation:not(.hidden)').length > 0) {
        document.getElementById('no-results').classList.add('hidden');
    } else {
        document.getElementById('no-results').classList.remove('hidden');
    }
}

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

    Object.keys(listOfBooks).sort((a, b) => listOfBooks[b]['annotations'].length - listOfBooks[a]['annotations'].length).forEach(bookHash => {
        let bookElement = $(`
                    <div class="book" data-hash="${bookHash}" data-offset="0">
                        <span class="name">${listOfBooks[bookHash]['name']}</span>
                        <span class="author">by ${listOfBooks[bookHash]['author']}</span>
                        <span class="count">${listOfBooks[bookHash]['annotations'].length} notes</span>
                    </div>
                `);

        bookElement.on('click', (e) => {
            // If it's not highlighted, highlight it
            if (!bookElement.hasClass('selected')) {
                const annotations = document.querySelector('.annotations');
                // Save the current scrollIndex for the other book
                const selected = $(`.book.selected`).first();
                if (selected.length > 0) {
                    selected.data('offset', annotations.scrollTop);
                    selected.removeClass('selected');
                }
                bookElement.addClass('selected');

                document.querySelector('.annotations').scrollTo({
                    top: bookElement.data('offset'),
                    behavior: "instant",
                });
            } else {
                // Else, take it as a cue to scroll to top
                document.querySelector('.annotations').scrollTo({
                    top: 0,
                    behavior: "smooth",
                });
            }

            // Make the relevant annotations visible
            currentHash = bookElement.data('hash');
            $(`.annotation`).addClass('hidden');
            updateAnnotationsForSearch();
        });

        booksList.append(bookElement);

        listOfBooks[bookHash]['annotations'].forEach(annotation => {
            let annotationElement = $(`
                        <div class="annotation hidden style-${annotation['style']}" data-hash="${bookHash}">
                            <mark class="text">${annotation['text']}</mark>
                        </div>
                    `);
            if (annotation['note'] !== null) {
                annotationElement.append($(`<div class="note">${annotation['note']}</div>`));
            }
            let info = $(`<div class="info"></div>`);
            if (annotation['chapter'] !== null) {
                info.append($(`<span class="chapter">${annotation['chapter']}</span><span class="divider">·</span>`))
            }
            let formattedDate = (new Date(annotation['date'] * 1000)).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            info.append($(`<span class="date">${formattedDate}</span>`));
            annotationElement.append(info);
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

document.addEventListener('DOMContentLoaded', () => {
    findInPage = new FindInPage({
        inputFocusColor: '#ce9ffc',
        textColor: '#212121',
        parentElement: document.querySelector('.annotations'),
    });
});

$(document).ready(async () => {
    $('#refresh').on('click', doStuff);
    doStuff();

    // Cmd + F hijacking
    $(window).keydown(function (e) {
        if (e.keyCode == 70 && (e.ctrlKey || e.metaKey)) {
            findInPage?.openFindWindow();
        }
    });

    let timeout;
    // Debounce searched function
    function handleInputChange() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            updateAnnotationsForSearch();

            // Reset the scroll to the top
            document.querySelector('.annotations').scrollTo({
                top: 0,
                behavior: "instant",
            });
        }, 300);
    }

    $('#search').on('input', handleInputChange);
});