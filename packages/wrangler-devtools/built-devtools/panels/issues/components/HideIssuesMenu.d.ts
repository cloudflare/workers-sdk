import * as Common from '../../../core/common/common.js';
export interface HiddenIssuesMenuData {
    menuItemLabel: Common.UIString.LocalizedString;
    menuItemAction: () => void;
}
export declare class HideIssuesMenu extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: HiddenIssuesMenuData);
    connectedCallback(): void;
    onMenuOpen(event: Event): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-hide-issues-menu': HideIssuesMenu;
    }
}
