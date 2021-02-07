import { GotoMessage, SearchResult } from "src/common";

function debounce(func: Function, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

declare const webviewApi: any;

const getResources = debounce(async query => {
    const results: SearchResult[] = await webviewApi.postMessage({
        type: 'search',
        query: query
    });

    const searchResults = document.getElementById('search-results');
    searchResults.innerText = '';

    if (results.length > 0) {
        for (let i = 0; i < results.length; i++) {
            const searchResult = results[i];
            const row = document.createElement('div');
            row.setAttribute('class', 'search-result-row');
            searchResults.appendChild(row);

            const resourceName = document.createElement('div');
            resourceName.setAttribute('class', 'resource-name-cell');
            resourceName.innerText = searchResult.title;
            row.appendChild(resourceName);

            const includedIn = document.createElement('div');
            includedIn.setAttribute('class', 'referencing-notes-cell');
            row.appendChild(includedIn);

            const referencingNotesList = document.createElement('div');
            referencingNotesList.setAttribute('class', 'referencing-notes-list')
            includedIn.appendChild(referencingNotesList);

            searchResult.notes.forEach(n =>{
                const noteLink = document.createElement('a');
                noteLink.setAttribute('href', '#');
                noteLink.addEventListener('click', ev => {
                    webviewApi.postMessage({
                        type: 'goto',
                        resourceId: searchResult.id,
                        noteId: n.id
                    } as GotoMessage);
                });
                noteLink.innerText = n.title;
                referencingNotesList.appendChild(noteLink);
            });
        }
    }
});

const queryInput = document.getElementById('query-input') as HTMLInputElement;
queryInput.addEventListener('input', e => {
    e.preventDefault();
    console.log(JSON.stringify(e));
    getResources(queryInput.value);
});