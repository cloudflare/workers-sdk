import * as Protocol from '../../../generated/protocol.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import type * as Platform from '../../../core/platform/platform.js';
export interface PermissionsPolicySectionData {
    policies: Protocol.Page.PermissionsPolicyFeatureState[];
    showDetails: boolean;
}
export declare function renderIconLink(iconName: string, title: Platform.UIString.LocalizedString, clickHandler: (() => void) | (() => Promise<void>)): LitHtml.TemplateResult;
export declare class PermissionsPolicySection extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: PermissionsPolicySectionData);
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-resources-permissions-policy-section': PermissionsPolicySection;
    }
}
