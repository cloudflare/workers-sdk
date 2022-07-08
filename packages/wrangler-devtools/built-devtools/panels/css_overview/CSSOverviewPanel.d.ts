import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class CSSOverviewPanel extends UI.Panel.Panel implements SDK.TargetManager.Observer {
    #private;
    private constructor();
    static instance(): CSSOverviewPanel;
    targetAdded(target: SDK.Target.Target): void;
    targetRemoved(): void;
    wasShown(): void;
}
