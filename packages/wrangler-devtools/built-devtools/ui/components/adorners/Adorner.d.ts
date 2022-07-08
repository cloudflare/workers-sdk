import type * as Platform from '../../../core/platform/platform.js';
export interface AdornerData {
    name: string;
    content: HTMLElement;
}
export declare class Adorner extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    name: string;
    set data(data: AdornerData);
    connectedCallback(): void;
    isActive(): boolean;
    /**
     * Toggle the active state of the adorner. Optionally pass `true` to force-set
     * an active state; pass `false` to force-set an inactive state.
     */
    toggle(forceActiveState?: boolean): void;
    show(): void;
    hide(): void;
    /**
     * Make adorner interactive by responding to click events with the provided action
     * and simulating ARIA-capable toggle button behavior.
     */
    addInteraction(action: EventListener, options: {
        ariaLabelDefault: Platform.UIString.LocalizedString;
        ariaLabelActive: Platform.UIString.LocalizedString;
        isToggle?: boolean;
        shouldPropagateOnKeydown?: boolean;
    }): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-adorner': Adorner;
    }
}
