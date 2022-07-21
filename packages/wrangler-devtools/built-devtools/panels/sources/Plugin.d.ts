import type * as Workspace from '../../models/workspace/workspace.js';
import type * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import type * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import type * as UI from '../../ui/legacy/legacy.js';
import type * as TextEditor from '../../ui/components/text_editor/text_editor.js';
export declare class Plugin {
    protected readonly uiSourceCode: Workspace.UISourceCode.UISourceCode;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode, _transformer?: SourceFrame.SourceFrame.Transformer);
    static accepts(_uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    willHide(): void;
    rightToolbarItems(): Promise<UI.Toolbar.ToolbarItem[]>;
    /**
     *
     * TODO(szuend): It is OK to asyncify this function (similar to {rightToolbarItems}),
     *               but it is currently not strictly necessary.
     */
    leftToolbarItems(): UI.Toolbar.ToolbarItem[];
    populateLineGutterContextMenu(_contextMenu: UI.ContextMenu.ContextMenu, _lineNumber: number): void;
    populateTextAreaContextMenu(_contextMenu: UI.ContextMenu.ContextMenu, _lineNumber: number, _columnNumber: number): void;
    decorationChanged(_type: SourceFrame.SourceFrame.DecoratorType, _editor: TextEditor.TextEditor.TextEditor): void;
    editorExtension(): CodeMirror.Extension;
    editorInitialized(_editor: TextEditor.TextEditor.TextEditor): void;
    dispose(): void;
}
