import * as Common from '../../../core/common/common.js';
import type * as Host from '../../../core/host/host.js';
export interface SyncSectionData {
    syncInfo: Host.InspectorFrontendHostAPI.SyncInformation;
    syncSetting: Common.Settings.Setting<boolean>;
}
export declare class SyncSection extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: SyncSectionData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-sync-section': SyncSection;
    }
}
