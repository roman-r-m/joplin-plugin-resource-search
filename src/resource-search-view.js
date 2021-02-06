function debounce(func, timeout = 300){
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}
const getResources = debounce(async query => {
    if (query.length > 0) {
        const results = await webviewApi.postMessage({
            type: 'search',
            query: query
        });
        const resultsRoot = document.getElementById('search-results');
        for (let i = 0; i < results.length; i++) {
            const row = results[i];
            const elem = document.createElement('div');
            elem.setAttribute('style', 'width: 100%;');
            elem.innerText = `${JSON.stringify(row)}`;
            resultsRoot.appendChild(elem);
        }
    } else {
        document.getElementById('search-results').textContent = '';
    }
});

const queryInput = document.getElementById('query-input');
queryInput.addEventListener('input', e => {
    e.preventDefault();
    console.log(JSON.stringify(e));
    getResources(queryInput.value);
});