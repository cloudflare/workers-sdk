import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class ClassesPaneWidget extends UI.Widget.Widget {
    private input;
    private readonly classesContainer;
    private readonly prompt;
    private readonly mutatingNodes;
    private readonly pendingNodeClasses;
    private readonly updateNodeThrottler;
    private previousTarget;
    constructor();
    private splitTextIntoClasses;
    private onKeyDown;
    private onTextChanged;
    private onDOMMutated;
    private onSelectedNodeChanged;
    wasShown(): void;
    private update;
    private onClick;
    private nodeClasses;
    private toggleClass;
    private installNodeClasses;
    private flushPendingClasses;
}
export declare class ButtonProvider implements UI.Toolbar.Provider {
    private readonly button;
    private view;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ButtonProvider;
    private clicked;
    item(): UI.Toolbar.ToolbarItem;
}
export declare class ClassNamePrompt extends UI.TextPrompt.TextPrompt {
    private readonly nodeClasses;
    private selectedFrameId;
    private classNamesPromise;
    constructor(nodeClasses: (arg0: SDK.DOMModel.DOMNode) => Map<string, boolean>);
    private getClassNames;
    private buildClassNameCompletions;
}
