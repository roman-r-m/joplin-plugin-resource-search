type SearchMessage = {
    type: 'search',
    query: string
}

type GotoMessage = {
    type: 'goto',
    resourceId: string,
    noteId: string
}

type Message = SearchMessage | GotoMessage;

type SearchResult = {
    id: string,
    title: string,
    note: NoteRef
};

type NoteRef = {
    title: string,
    id: string
}

export { Message, SearchMessage, GotoMessage, SearchResult, NoteRef };