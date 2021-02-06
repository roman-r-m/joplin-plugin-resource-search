function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

declare const webviewApi: any;

const getResources = debounce(async query => {
    const results = await webviewApi.postMessage({
        type: 'search',
        query: query
    });

    const searchResults = document.getElementById('search-results');
    searchResults.innerText = '';

    if (results.length > 0) {
        searchResults.innerHTML = `
            <div id="results-header">
                <div id="file-title">Name</div><div id="referencing-notes">Included in</div>
            </div>`;

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
            const noteLink = document.createElement('a');
            noteLink.setAttribute('href', '#');
            noteLink.innerText = searchResult.noteTitle;
            includedIn.appendChild(noteLink);
            row.appendChild(includedIn);
        }
    }
});

const queryInput = document.getElementById('query-input') as HTMLInputElement;
queryInput.addEventListener('input', e => {
    e.preventDefault();
    console.log(JSON.stringify(e));
    getResources(queryInput.value);
});