export declare class HistoryInput extends HTMLInputElement {
    private history;
    private historyPosition;
    constructor();
    static create(): HistoryInput;
    private onInput;
    private onKeyDown;
    private saveToHistory;
}
