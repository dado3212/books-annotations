const { ipcRenderer } = require('electron');

var listOfBooks = {};
var searching = false;
var currentSearch = '';
var newSearch = true;

// Adapted from https://gist.github.com/mlitwin/1a5471ae2897c360914247bc8db6b57a
function cfiToSortableValue(cfi) {
    cfi = cfi.replace('epubcfi(', '').replace(')', '');
    cfi = cfi.replace(/\[[^\]]*\]/g, '');

    return cfi.split(/\D+/).filter(x => x !== '').map(Number);
}

// Takes in the ePub CFI and tries to divine a name. From
// looking at examples, this only happens when [Book-Name]/[Book-Name]
// appears, so look for that format, and strip the trailing -123 suffixes
// the correspond to the chapters.
function guessName(cfi) {
    const regex = /\[([^\]]+)\]/g;
    let matches = [];
    let match;

    while ((match = regex.exec(cfi)) !== null) {
        matches.push(match[1]);
    }

    if (matches.length <= 1) {
        return null;
    }

    if (!matches[1].includes(matches[0])) {
        return null;
    }

    // Best guess
    let guess = matches[0].replace(/[\d-]+$/, '');
    // Should be the right length
    if (guess.length <= 3) {
        return null;
    }
    // Shouldn't contain certain words
    if (['epub', 'chapter', 'prologue', 'ebook'].some(forbiddenString =>
        guess.toLowerCase().includes(forbiddenString.toLowerCase())
    )) {
        return null;
    }
    // Shouldn't BE other words
    if (['introduction'].some(forbiddenString =>
        guess.toLowerCase() == forbiddenString.toLowerCase())
    ) {
        return null;
    }
    return guess;
}

function handleBookmark(bookmark) {
    if (!('annotationSelectedText' in bookmark)) {
        return;
    }
    hash = bookmark['annotationAssetID']

    if (!(hash in listOfBooks)) {
        listOfBooks[hash] = {
            'name': hash,
            'author': 'Unknown',
            'annotations': [],
        }
    }
    // Try and guess the name if it's in the location string
    if (listOfBooks[hash]['name'] == hash) {
        let possibleName = guessName(bookmark['annotationLocation']);
        if (possibleName !== null) {
            listOfBooks[hash]['name'] = possibleName;
        }
    }
    listOfBooks[hash]['annotations'].push({
        'date': bookmark["annotationCreationDate"],
        'selectedText': bookmark['annotationSelectedText'],
        'representativeText': ('annotationRepresentativeText' in bookmark) ? bookmark['annotationRepresentativeText'] : null,
        'location': bookmark['annotationLocation'],
        'style': bookmark['annotationStyle'],
        'note': ('annotationNote' in bookmark) ? bookmark['annotationNote'] : null,
        'chapter': ('futureProofing5' in bookmark) ? bookmark['futureProofing5'] : null,
    });
}

async function startFetch(button) {
    let booksData = await ipcRenderer.invoke('read-plist', '/Books/Purchases/Purchases.plist', 'normal');
    if (booksData == null) {
        populate(button);
        return;
    }

    booksData['Books'].forEach(book => {
        listOfBooks[book['Package Hash']] = {
            'name': book['Name'],
            'author': book['Artist'],
            'annotations': [],
        }
    });

    let annotationsData = await ipcRenderer.invoke('read-plist', '/Books/com.apple.ibooks-sync.plist', 'normal');
    if (annotationsData == null) {
        populate(button);
        return;
    }
    annotationsData = annotationsData[Object.keys(annotationsData)[0]];
    // This is often called 'Bookmarks' but is also '4' for at least one user. Just
    // loop over and find the array to make it more resilient. Choose the biggest array
    // in case there are multiple (though I haven't seen that)
    let bookmarks = [];
    for (const [key, value] of Object.entries(annotationsData)) {
        if (Array.isArray(value) && value.length > bookmarks.length) {
            bookmarks = value;
        }
    }

    bookmarks.forEach(handleBookmark);

    // Try and read the older annotations (though we mostly don't have names for these)
    let oldData = await ipcRenderer.invoke('read-plist', '/Books/iBooksData2.plist', 'binary');
    if (oldData !== null) {
        bookmarks = oldData[0]['1.2']['BKBookmark'];

        bookmarks.forEach(handleBookmark);
    }

    populate(button);
}

async function populate(button) {
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

    if (Object.keys(listOfBooks).length == 0) {
        document.getElementById('no-results').classList.remove('hidden');
    } else {
        document.getElementById('no-results').classList.add('hidden');
    }

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
            let hash = bookElement.data('hash');
            $(`.annotation`).addClass('hidden');
            $(`.annotation[data-hash="${hash}"]`).removeClass('hidden');
        });

        booksList.append(bookElement);

        listOfBooks[bookHash]['annotations'].forEach(annotation => {
            let annotationElement = `<div class="annotation hidden" data-hash="${bookHash}">`;
            if (annotation['representativeText'] !== null && annotation['representativeText'].includes(annotation['selectedText'])) {
                annotationElement += annotation['representativeText'].replace(
                    annotation['selectedText'],
                    `<mark class="style-${annotation['style']}">${annotation['selectedText']}</mark>`
                ).replace("\n", "<br>");
            } else {
                annotationElement += `<mark class="style-${annotation['style']}">${annotation['selectedText']}</mark>`.replace("\n", "<br>");
            }
            annotationElement = $(annotationElement + '</div>');
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
    button.removeClass('loading');
}

ipcRenderer.on('debug-log', function (_, data) {
    console.log(data);
});

ipcRenderer.on('error', function (_, error) {
    $('.devices span')[0].innerHTML = error;
});

ipcRenderer.on('device-name', function (_, info) {
    document.getElementById('refresh').disabled = false;

    $('#devices .device').remove();

    if (!info.success) {
        $('.devices span')[0].innerHTML = info.message;
    } else {
        $('.devices span')[0].innerHTML = '';
        const button = $(`
            <button class="device">
                <i class="fas fa-mobile-screen"></i>${info.name}
            </button>
        `);
        button.on('click', async () => {
            button.addClass('loading');
            $('.devices span')[0].innerHTML = '';
            // Reset the local list of books
            listOfBooks = {};
            $('.book').remove();
            $('.annotation').remove();
            // Try and start fetching
            await startFetch(button);
        });
        $('#devices').append(button);
    }
});

async function doStuff() {
    document.getElementById('refresh').disabled = true;
    await ipcRenderer.invoke('fetch-devices');
}

ipcRenderer.on('found-in-page', (_, result) => {
    document.querySelector('.search .progress').innerHTML = `${result['activeMatchOrdinal']}/${result['matches']}`;
    if (newSearch) {
        document.querySelector('.search input').focus();
        newSearch = false;
    }
});

$(document).ready(async () => {
    $('#refresh').on('click', doStuff);
    doStuff();

    $(window).keydown(function (e) {
        // Cmd + F hijacking
        if (e.keyCode == 70 && (e.ctrlKey || e.metaKey)) {
            const searchBar = document.getElementById('search');
            if (searchBar) {
                searchBar.focus();
                searchBar.select();
            }
            // Hit enter anywhere to index through (or shift+enter to go back)
        } else if (e.keyCode == 13) {
            if (currentSearch !== '') {
                ipcRenderer.sendSync('find-in-page', currentSearch, { forward: !e.shiftKey, findNext: false, matchCase: false });
            }
            // Escape to exit the selection
        } else if (e.code == "Escape") {
            searching = false;
            document.querySelectorAll('.search span').forEach(a => a.classList.add('hidden'));
            ipcRenderer.sendSync('stop-find-in-page', 'clearSelection');
        }
    });

    $('#back').on('click', () => {
        if (!searching) {
            return;
        }
        ipcRenderer.sendSync('find-in-page', currentSearch, { forward: false, findNext: false, matchCase: false });
    });
    $('#forward').on('click', () => {
        if (!searching) {
            return;
        }
        ipcRenderer.sendSync('find-in-page', currentSearch, { forward: true, findNext: false, matchCase: false });
    });

    let timeout;
    // Debounce searched function
    function handleInputChange() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            const search = $('#search').val();
            if (currentSearch == search) {
                return;
            }
            currentSearch = search;
            if (currentSearch !== '') {
                searching = true;
                document.querySelectorAll('.search span').forEach(a => a.classList.remove('hidden'));
                newSearch = true;
                ipcRenderer.sendSync('find-in-page', currentSearch, { forward: true, findNext: true, matchCase: false });
            } else {
                searching = false;
                document.querySelectorAll('.search span').forEach(a => a.classList.add('hidden'));
                ipcRenderer.sendSync('stop-find-in-page', 'clearSelection');
            }
        }, 300);
    }

    $('#search').on('input', handleInputChange);
});