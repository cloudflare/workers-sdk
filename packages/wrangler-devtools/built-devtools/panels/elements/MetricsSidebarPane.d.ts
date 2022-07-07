import * as SDK from '../../core/sdk/sdk.js';
import { ElementsSidebarPane } from './ElementsSidebarPane.js';
export declare class MetricsSidebarPane extends ElementsSidebarPane {
    originalPropertyData: SDK.CSSProperty.CSSProperty | null;
    previousPropertyDataCandidate: SDK.CSSProperty.CSSProperty | null;
    private inlineStyle;
    private highlightMode;
    private boxElements;
    private isEditingMetrics?;
    constructor();
    doUpdate(): Promise<void>;
    onCSSModelChanged(): void;
    /**
     * Toggle the visibility of the Metrics pane. This toggle allows external
     * callers to control the visibility of this pane, but toggling this on does
     * not guarantee the pane will always show up, because the pane's visibility
     * is also controlled by the internal condition that style cannot be empty.
     */
    toggleVisibility(isVisible: boolean): void;
    private getPropertyValueAsPx;
    private getBox;
    private highlightDOMNode;
    private updateMetrics;
    startEditing(targetElement: Element, box: string, styleProperty: string, computedStyle: Map<string, string>): void;
    private handleKeyDown;
    editingEnded(element: Element, context: {
        keyDownHandler: (arg0: Event) => void;
    }): void;
    editingCancelled(element: Element, context: {
        box: string;
        styleProperty: string;
        computedStyle: Map<string, string>;
        keyDownHandler: (arg0: Event) => void;
    }): void;
    private applyUserInput;
    private editingCommitted;
    wasShown(): void;
}
