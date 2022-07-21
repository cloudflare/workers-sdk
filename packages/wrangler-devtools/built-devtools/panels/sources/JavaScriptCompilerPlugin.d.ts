import * as Workspace from '../../models/workspace/workspace.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import type * as TextEditor from '../../ui/components/text_editor/text_editor.js';
import { Plugin } from './Plugin.js';
export declare class JavaScriptCompilerPlugin extends Plugin {
    private compiling;
    private recompileScheduled;
    private timeout;
    private message;
    private disposed;
    private editor;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode);
    editorExtension(): CodeMirror.Extension;
    editorInitialized(editor: TextEditor.TextEditor.TextEditor): void;
    static accepts(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    private scheduleCompile;
    private findRuntimeModel;
    private compile;
    private compilationFinishedForTest;
    dispose(): void;
}
export declare const CompileDelay = 1000;
