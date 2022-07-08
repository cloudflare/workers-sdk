import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class WarningErrorCounter implements UI.Toolbar.Provider {
    private readonly toolbarItem;
    private consoleCounter;
    private issueCounter;
    private readonly throttler;
    updatingForTest?: boolean;
    private constructor();
    onSetCompactLayout(event: Common.EventTarget.EventTargetEvent<boolean>): void;
    setCompactLayout(enable: boolean): void;
    static instance(opts?: {
        forceNew: boolean | null;
    }): WarningErrorCounter;
    private updatedForTest;
    private update;
    get titlesForTesting(): string | null;
    private updateThrottled;
    item(): UI.Toolbar.ToolbarItem | null;
    static instanceForTest: WarningErrorCounter | null;
}
