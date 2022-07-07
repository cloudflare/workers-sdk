interface Hint {
    getHintPrefix(): string;
    getHintMessage(): string;
    getPossibleFixMessage(): string | null;
    getLearnMoreLink(): string | null;
}
export declare class CSSHintDetailsView extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    constructor(authoringHint: Hint);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-css-hint-details-view': CSSHintDetailsView;
    }
}
export {};
