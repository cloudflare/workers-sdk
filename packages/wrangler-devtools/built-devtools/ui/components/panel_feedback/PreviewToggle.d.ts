import * as Root from '../../../core/root/root.js';
export interface PreviewToggleData {
    name: string;
    helperText: string | null;
    feedbackURL: string | null;
    experiment: Root.Runtime.ExperimentName;
    learnMoreURL?: string;
    onChangeCallback?: (checked: boolean) => void;
}
export declare class PreviewToggle extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: PreviewToggleData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-preview-toggle': PreviewToggle;
    }
}
