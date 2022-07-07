import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as TextEditor from '../../ui/components/text_editor/text_editor.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class ConsolePinPane extends UI.ThrottledWidget.ThrottledWidget {
    private readonly liveExpressionButton;
    private readonly focusOut;
    private pins;
    private readonly pinsSetting;
    constructor(liveExpressionButton: UI.Toolbar.ToolbarButton, focusOut: () => void);
    wasShown(): void;
    willHide(): void;
    savePins(): void;
    private contextMenuEventFired;
    private removeAllPins;
    removePin(pin: ConsolePin): void;
    addPin(expression: string, userGesture?: boolean): void;
    private focusedPinAfterDeletion;
    doUpdate(): Promise<void>;
    private updatedForTest;
}
export declare class ConsolePin {
    private readonly pinPane;
    private readonly focusOut;
    private readonly pinElement;
    private readonly pinPreview;
    private lastResult;
    private lastExecutionContext;
    private editor;
    private committedExpression;
    private hovered;
    private lastNode;
    private deletePinIcon;
    constructor(expression: string, pinPane: ConsolePinPane, focusOut: () => void);
    createEditor(expression: string, parent: HTMLElement): TextEditor.TextEditor.TextEditor;
    onBlur(editor: CodeMirror.EditorView): void;
    setHovered(hovered: boolean): void;
    expression(): string;
    element(): Element;
    focus(): Promise<void>;
    appendToContextMenu(contextMenu: UI.ContextMenu.ContextMenu): void;
    updatePreview(): Promise<void>;
}
