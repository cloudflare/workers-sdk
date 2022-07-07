import type * as Workspace from '../../models/workspace/workspace.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as TextEditor from '../../ui/components/text_editor/text_editor.js';
import { Plugin } from './Plugin.js';
export declare class CoveragePlugin extends Plugin {
    private originalSourceCode;
    private infoInToolbar;
    private model;
    private coverage;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode);
    dispose(): void;
    static accepts(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    private handleReset;
    private handleCoverageSizesChanged;
    private updateStats;
    rightToolbarItems(): Promise<UI.Toolbar.ToolbarItem[]>;
    editorExtension(): CodeMirror.Extension;
    private getCoverageManager;
    editorInitialized(editor: TextEditor.TextEditor.TextEditor): void;
    decorationChanged(type: SourceFrame.SourceFrame.DecoratorType, editor: TextEditor.TextEditor.TextEditor): void;
    private startDecoUpdate;
}
