declare global {
    interface HTMLElementTagNameMap {
        'devtools-chrome-link': ChromeLink;
    }
}
export declare class ChromeLink extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    connectedCallback(): void;
    set href(href: string);
    openSettingsTab(event: Event): void;
}
