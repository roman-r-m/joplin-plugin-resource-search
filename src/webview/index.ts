import { GotoMessage, SearchResult } from "src/common";

declare const webviewApi: any;

function debounce(func: Function, timeout = 300) {
    let timer: any;
    return (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}
class SearchDialog {

    root: Element;
    results: SearchResult[];
    selectedIndex: number = -1;
    search: Function;

    constructor() {
        this.search = debounce(this.getResources);
        const queryInput = document.getElementById('query-input') as HTMLInputElement;
        queryInput.addEventListener('input', e => {
            e.preventDefault();
            this.getResources(queryInput.value);
        });

        const root = document.getElementById('joplin-plugin-content');
        root.addEventListener('keydown', evt => this.onKey(evt));
    }

    onKey(event: KeyboardEvent): any {
        const key = event.key;
        switch (key) {
            case 'Up':
            case 'Down':
            case 'ArrowUp':
            case 'ArrowDown': {
                const results = document.getElementById('search-results');
                const newIndex = key === 'ArrowUp' || key === 'Up' ? this.selectedIndex - 1 : this.selectedIndex + 1;
                const max = results.children.length;
                if (max > 0) {
                    if (this.selectedIndex >= 0) {
                        results.children[this.selectedIndex].removeAttribute('selected');
                    }
                    this.selectedIndex = newIndex < 0 ? max - 1 : (newIndex % results.children.length);
                    results.children[this.selectedIndex].setAttribute('selected', 'true');
                }
                event.preventDefault();
                break;
            }
            case 'Enter':
                this.select(this.selectedIndex);
                break;
        }
    }

    async getResources(query: string) {
        this.results = await webviewApi.postMessage({
            type: 'search',
            query: query
        });

        // TODO compare new with existing and only redraw on change?
        this.redraw();
    }

    select(index: number) {
        if (index >= 0 && index < this.results.length) {
            const result = this.results[index];
            webviewApi.postMessage({
                type: 'goto',
                resourceId: result.id,
                noteId: result.note.id
            } as GotoMessage);
        }
    }
    redraw() {
        const searchResults = document.getElementById('search-results');
        searchResults.innerText = '';

        if (this.results.length > 0) {
            this.selectedIndex = -1;
            for (let i = 0; i < this.results.length; i++) {
                const searchResult = this.results[i];
                const row = document.createElement('li');
                row.setAttribute('class', 'search-result-row');
                searchResults.appendChild(row);

                row.addEventListener('click', _e => this.select(i));

                const resourceName = document.createElement('div');
                resourceName.setAttribute('class', 'resource-name-cell');
                resourceName.innerText = searchResult.title;
                row.appendChild(resourceName);

                const includedIn = document.createElement('div');
                includedIn.setAttribute('class', 'referencing-notes-cell');
                includedIn.innerText = `In: ${searchResult.note.title}`;
                row.appendChild(includedIn);
            }
        }
    }
}

new SearchDialog();