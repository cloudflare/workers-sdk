import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
import * as ApplicationComponents from './components/components.js';
export declare const i18nString: (id: string, values?: import("../../core/i18n/i18nTypes.js").Values | undefined) => import("../../core/platform/UIString.js").LocalizedString;
export declare class ReportingApiReportsView extends UI.SplitWidget.SplitWidget {
    private readonly reportsGrid;
    private reports;
    constructor(networkManager: SDK.NetworkManager.NetworkManager);
    wasShown(): void;
    private onReportAdded;
    private onReportUpdated;
    private onFocus;
    getReports(): Protocol.Network.ReportingApiReport[];
    getReportsGrid(): ApplicationComponents.ReportsGrid.ReportsGrid;
}
