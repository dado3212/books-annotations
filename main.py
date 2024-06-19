import plistlib, json, re

# From old file (ignore this for now)
# playlist_file = open("iBooksData2.plist", "rb")
# pl = plistlib.load(playlist_file)
# playlist_file.close()

# x = open('tmp.txt', 'w')
    
# bookmarks = pl['1.2']['BKBookmark']
# bookmarks.sort(key=lambda bookmark: bookmark["annotationCreationDate"], reverse=True)

# ---------

# Get all of the books, their titles and authors
books_file = open("Books.plist", "rb")
list_of_books_plist = plistlib.load(books_file)['Books']
books_file.close()

list_of_books = {}
for book in list_of_books_plist:
    list_of_books[book['Package Hash']] = {
        'Name': book['Name'],
        'Author': book['Artist'],
        'Annotations': [], 
    }

# Extract all of the annotations
annotations_file = open("com.apple.ibooks-sync.plist", "rb")
pl = plistlib.load(annotations_file)
annotations_file.close()

bookmarks = pl[list(pl.keys())[0]]['Bookmarks']
bookmarks.sort(key=lambda bookmark: bookmark["annotationCreationDate"], reverse=True)

for bookmark in bookmarks:
    if 'annotationSelectedText' not in bookmark:
        print(bookmark)
        continue
    text = bookmark['annotationSelectedText']
    if 'annotationRepresentativeText' in bookmark and text in bookmark['annotationRepresentativeText']:
        text = bookmark['annotationRepresentativeText']
    hash = bookmark['annotationAssetID']
    if hash not in list_of_books:
        list_of_books[hash] = {
            'Name': '[?] ' + hash,
            'Author': 'Unknown',
            'Annotations': [], 
        }
    list_of_books[hash]['Annotations'].append({
        'date': bookmark["annotationCreationDate"],
        'text': text,
        'location': bookmark['annotationLocation']
    })
    
def cfi_to_sortable_value(cfi):
    x = 'epubcfi(/6/304[id167]!/4[4F1KC0-7077b85d15a1406085690fde3201ca05]/710/2/1,:0,:23)'
    cfi = cfi.replace('epubcfi(', '').replace(')', '')
    cfi = re.sub(r'\[[^\]]*\]', '', cfi)
    
    return [int(x) for x in re.split('[^\d]+', cfi) if x != '']

# Post-process (sort by location, remove those with no annotations)
for key in list(list_of_books.keys()):
    if len(list_of_books[key]['Annotations']) == 0:
        del list_of_books[key]
        continue
    list_of_books[key]['Annotations'].sort(key=lambda bookmark: cfi_to_sortable_value(bookmark["location"]))

with open('result.json', 'w') as fp:
    json.dump(list_of_books, fp, indent=4)
