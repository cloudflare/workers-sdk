import * as UI from '../../ui/legacy/legacy.js';
import type { EditorAction, SourcesView } from './SourcesView.js';
export declare class ScriptFormatterEditorAction implements EditorAction {
    private readonly pathsToFormatOnLoad;
    private sourcesView;
    private button;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ScriptFormatterEditorAction;
    private editorSelected;
    private editorClosed;
    private updateButton;
    getOrCreateButton(sourcesView: SourcesView): UI.Toolbar.ToolbarButton;
    private isFormattableScript;
    isCurrentUISourceCodeFormattable(): boolean;
    private onFormatScriptButtonClicked;
    toggleFormatScriptSource(): void;
    private showFormatted;
}
