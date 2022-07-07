import * as Common from '../../../core/common/common.js';
import type * as Host from '../../../core/host/host.js';
export declare type CanShowSurveyCallback = (result: Host.InspectorFrontendHostAPI.CanShowSurveyResult) => void;
export declare type ShowSurveyCallback = (result: Host.InspectorFrontendHostAPI.ShowSurveyResult) => void;
export interface SurveyLinkData {
    trigger: string;
    promptText: Common.UIString.LocalizedString;
    canShowSurvey: (trigger: string, callback: CanShowSurveyCallback) => void;
    showSurvey: (trigger: string, callback: ShowSurveyCallback) => void;
}
export declare class SurveyLink extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: SurveyLinkData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-survey-link': SurveyLink;
    }
}
