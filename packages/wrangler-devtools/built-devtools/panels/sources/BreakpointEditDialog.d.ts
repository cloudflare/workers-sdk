import * as UI from '../../ui/legacy/legacy.js';
export declare class BreakpointEditDialog extends UI.Widget.Widget {
    private readonly onFinish;
    private finished;
    private editor;
    private isLogpoint;
    private readonly typeSelector;
    private placeholderCompartment;
    constructor(editorLineNumber: number, oldCondition: string, preferLogpoint: boolean, onFinish: (arg0: {
        committed: boolean;
        condition: string;
    }) => Promise<void>);
    focusEditor(): void;
    private static conditionForLogpoint;
    private onTypeChanged;
    private get breakpointType();
    private getPlaceholder;
    private updateTooltip;
    finishEditing(committed: boolean, condition: string): void;
    wasShown(): void;
}
export declare const LogpointPrefix = "/** DEVTOOLS_LOGPOINT */ console.log(";
export declare const LogpointSuffix = ")";
export declare const BreakpointType: {
    Breakpoint: string;
    Conditional: string;
    Logpoint: string;
};
