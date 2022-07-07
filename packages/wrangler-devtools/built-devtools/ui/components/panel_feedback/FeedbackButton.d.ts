import * as Platform from '../../../core/platform/platform.js';
export interface FeedbackButtonData {
    feedbackUrl: Platform.DevToolsPath.UrlString;
}
export declare class FeedbackButton extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    set data(data: FeedbackButtonData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-feedback-button': FeedbackButton;
    }
}
