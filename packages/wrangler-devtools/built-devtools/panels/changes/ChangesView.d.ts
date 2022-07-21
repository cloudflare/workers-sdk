import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ChangesSidebar } from './ChangesSidebar.js';
export declare class ChangesView extends UI.Widget.VBox {
    #private;
    private emptyWidget;
    private readonly workspaceDiff;
    readonly changesSidebar: ChangesSidebar;
    private selectedUISourceCode;
    private readonly diffContainer;
    private readonly toolbar;
    private readonly diffStats;
    private readonly diffView;
    private readonly copyButton;
    private readonly copyButtonSeparator;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ChangesView;
    private selectedUISourceCodeChanged;
    private revert;
    private copyChanges;
    private click;
    private revealUISourceCode;
    wasShown(): void;
    private refreshDiff;
    private hideDiff;
    private renderDiffRows;
}
export declare class DiffUILocationRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean;
    }): DiffUILocationRevealer;
    reveal(diffUILocation: Object, omitFocus?: boolean | undefined): Promise<void>;
}
