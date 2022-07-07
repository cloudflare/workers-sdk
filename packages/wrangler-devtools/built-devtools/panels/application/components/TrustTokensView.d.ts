import * as DataGrid from '../../../ui/components/data_grid/data_grid.js';
import type * as Protocol from '../../../generated/protocol.js';
export declare const i18nString: (id: string, values?: import("../../../core/i18n/i18nTypes.js").Values | undefined) => import("../../../core/platform/UIString.js").LocalizedString;
interface TrustTokensDeleteButtonData {
    issuer: DataGrid.DataGridUtils.CellValue;
    deleteClickHandler: (issuerOrigin: string) => void;
}
declare class TrustTokensDeleteButton extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: TrustTokensDeleteButtonData);
}
export interface TrustTokensViewData {
    tokens: Protocol.Storage.TrustTokens[];
    deleteClickHandler: (issuerOrigin: string) => void;
}
export declare class TrustTokensView extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: TrustTokensViewData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-trust-tokens-storage-view': TrustTokensView;
        'devtools-trust-tokens-delete-button': TrustTokensDeleteButton;
    }
}
export {};
