// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Formatter from '../../models/formatter/formatter.js';
import * as SourceMapScopes from '../../models/source_map_scopes/source_map_scopes.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as TextEditor from '../../ui/components/text_editor/text_editor.js';
import * as ObjectUI from '../../ui/legacy/components/object_ui/object_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ConsolePanel } from './ConsolePanel.js';
import consolePromptStyles from './consolePrompt.css.js';
const UIStrings = {
    /**
    *@description Text in Console Prompt of the Console panel
    */
    consolePrompt: 'Console prompt',
};
const str_ = i18n.i18n.registerUIStrings('panels/console/ConsolePrompt.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ConsolePrompt extends Common.ObjectWrapper.eventMixin(UI.Widget.Widget) {
    addCompletionsFromHistory;
    historyInternal;
    initialText;
    editor;
    eagerPreviewElement;
    textChangeThrottler;
    formatter;
    requestPreviewBound;
    requestPreviewCurrent = 0;
    innerPreviewElement;
    promptIcon;
    iconThrottler;
    eagerEvalSetting;
    previewRequestForTest;
    highlightingNode;
    // The CodeMirror state field that controls whether the argument hints are showing.
    // If they are, the escape key will clear them. However, if they aren't, then the
    // console drawer should be hidden as a whole.
    #argumentHintsState;
    constructor() {
        super();
        this.addCompletionsFromHistory = true;
        this.historyInternal = new ConsoleHistoryManager();
        this.initialText = '';
        this.eagerPreviewElement = document.createElement('div');
        this.eagerPreviewElement.classList.add('console-eager-preview');
        this.textChangeThrottler = new Common.Throttler.Throttler(150);
        this.formatter = new ObjectUI.RemoteObjectPreviewFormatter.RemoteObjectPreviewFormatter();
        this.requestPreviewBound = this.requestPreview.bind(this);
        this.innerPreviewElement = this.eagerPreviewElement.createChild('div', 'console-eager-inner-preview');
        this.eagerPreviewElement.appendChild(UI.Icon.Icon.create('smallicon-command-result', 'preview-result-icon'));
        const editorContainerElement = this.element.createChild('div', 'console-prompt-editor-container');
        this.element.appendChild(this.eagerPreviewElement);
        this.promptIcon = UI.Icon.Icon.create('smallicon-text-prompt', 'console-prompt-icon');
        this.element.appendChild(this.promptIcon);
        this.iconThrottler = new Common.Throttler.Throttler(0);
        this.eagerEvalSetting = Common.Settings.Settings.instance().moduleSetting('consoleEagerEval');
        this.eagerEvalSetting.addChangeListener(this.eagerSettingChanged.bind(this));
        this.eagerPreviewElement.classList.toggle('hidden', !this.eagerEvalSetting.get());
        this.element.tabIndex = 0;
        this.previewRequestForTest = null;
        this.highlightingNode = false;
        const argumentHints = TextEditor.JavaScript.argumentHints();
        this.#argumentHintsState = argumentHints[0];
        const editorState = CodeMirror.EditorState.create({
            doc: this.initialText,
            extensions: [
                CodeMirror.keymap.of(this.editorKeymap()),
                CodeMirror.EditorView.updateListener.of(update => this.editorUpdate(update)),
                argumentHints,
                TextEditor.JavaScript.completion(),
                TextEditor.Config.showCompletionHint,
                CodeMirror.javascript.javascript(),
                TextEditor.Config.baseConfiguration(this.initialText),
                TextEditor.Config.autocompletion,
                CodeMirror.javascript.javascriptLanguage.data.of({
                    autocomplete: (context) => this.historyCompletions(context),
                }),
                CodeMirror.EditorView.contentAttributes.of({ 'aria-label': i18nString(UIStrings.consolePrompt) }),
                CodeMirror.EditorView.lineWrapping,
                CodeMirror.autocompletion({ aboveCursor: true }),
            ],
        });
        this.editor = new TextEditor.TextEditor.TextEditor(editorState);
        this.editor.addEventListener('keydown', (event) => {
            if (event.defaultPrevented) {
                event.stopPropagation();
            }
        });
        editorContainerElement.appendChild(this.editor);
        if (this.hasFocus()) {
            this.focus();
        }
        this.element.removeAttribute('tabindex');
        this.editorSetForTest();
        // Record the console tool load time after the console prompt constructor is complete.
        Host.userMetrics.panelLoaded('console', 'DevTools.Launch.Console');
    }
    eagerSettingChanged() {
        const enabled = this.eagerEvalSetting.get();
        this.eagerPreviewElement.classList.toggle('hidden', !enabled);
        if (enabled) {
            void this.requestPreview();
        }
    }
    belowEditorElement() {
        return this.eagerPreviewElement;
    }
    onTextChanged() {
        // ConsoleView and prompt both use a throttler, so we clear the preview
        // ASAP to avoid inconsistency between a fresh viewport and stale preview.
        if (this.eagerEvalSetting.get()) {
            const asSoonAsPossible = !TextEditor.Config.contentIncludingHint(this.editor.editor);
            this.previewRequestForTest = this.textChangeThrottler.schedule(this.requestPreviewBound, asSoonAsPossible);
        }
        this.updatePromptIcon();
        this.dispatchEventToListeners("TextChanged" /* TextChanged */);
    }
    async requestPreview() {
        const id = ++this.requestPreviewCurrent;
        const text = TextEditor.Config.contentIncludingHint(this.editor.editor).trim();
        const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        const { preview, result } = await ObjectUI.JavaScriptREPL.JavaScriptREPL.evaluateAndBuildPreview(text, true /* throwOnSideEffect */, true /* replMode */, 500 /* timeout */);
        if (this.requestPreviewCurrent !== id) {
            return;
        }
        this.innerPreviewElement.removeChildren();
        if (preview.deepTextContent() !== TextEditor.Config.contentIncludingHint(this.editor.editor).trim()) {
            this.innerPreviewElement.appendChild(preview);
        }
        if (result && 'object' in result && result.object && result.object.subtype === 'node') {
            this.highlightingNode = true;
            SDK.OverlayModel.OverlayModel.highlightObjectAsDOMNode(result.object);
        }
        else if (this.highlightingNode) {
            this.highlightingNode = false;
            SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
        }
        if (result && executionContext) {
            executionContext.runtimeModel.releaseEvaluationResult(result);
        }
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([consolePromptStyles]);
    }
    willHide() {
        if (this.highlightingNode) {
            this.highlightingNode = false;
            SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
        }
    }
    history() {
        return this.historyInternal;
    }
    clearAutocomplete() {
        CodeMirror.closeCompletion(this.editor.editor);
    }
    isCaretAtEndOfPrompt() {
        return this.editor.state.selection.main.head === this.editor.state.doc.length;
    }
    moveCaretToEndOfPrompt() {
        this.editor.dispatch({
            selection: CodeMirror.EditorSelection.cursor(this.editor.state.doc.length),
        });
    }
    clear() {
        this.editor.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length },
        });
    }
    text() {
        return this.editor.state.doc.toString();
    }
    setAddCompletionsFromHistory(value) {
        this.addCompletionsFromHistory = value;
    }
    editorKeymap() {
        return [
            { key: 'ArrowUp', run: () => this.moveHistory(-1) },
            { key: 'ArrowDown', run: () => this.moveHistory(1) },
            { mac: 'Ctrl-p', run: () => this.moveHistory(-1, true) },
            { mac: 'Ctrl-n', run: () => this.moveHistory(1, true) },
            {
                key: 'Escape',
                run: () => {
                    return TextEditor.JavaScript.closeArgumentsHintsTooltip(this.editor.editor, this.#argumentHintsState);
                },
            },
            {
                key: 'Enter',
                run: () => {
                    void this.handleEnter();
                    return true;
                },
                shift: CodeMirror.insertNewlineAndIndent,
            },
        ];
    }
    moveHistory(dir, force = false) {
        const { editor } = this.editor, { main } = editor.state.selection;
        if (!force) {
            if (!main.empty) {
                return false;
            }
            const cursorCoords = editor.coordsAtPos(main.head);
            const endCoords = editor.coordsAtPos(dir < 0 ? 0 : editor.state.doc.length);
            // Check if there are wrapped lines in this direction, and let
            // the cursor move normally if there are.
            if (cursorCoords && endCoords &&
                (dir < 0 ? cursorCoords.top > endCoords.top + 5 : cursorCoords.bottom < endCoords.bottom - 5)) {
                return false;
            }
        }
        const history = this.historyInternal;
        const newText = dir < 0 ? history.previous(this.text()) : history.next();
        if (newText === undefined) {
            return false;
        }
        // Change the prompt input to the history content, and scroll to the end to
        // bring the full content (potentially multiple lines) into view.
        const cursorPos = newText.length;
        this.editor.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length, insert: newText },
            selection: CodeMirror.EditorSelection.cursor(cursorPos),
            scrollIntoView: true,
        });
        if (dir < 0) {
            // If we are going back in history, put the cursor to the end of the first line
            // so that the user can quickly go further back in history.
            const firstLineBreak = newText.search(/\n|$/);
            this.editor.dispatch({
                selection: CodeMirror.EditorSelection.cursor(firstLineBreak),
            });
        }
        return true;
    }
    async enterWillEvaluate() {
        const { state } = this.editor;
        return state.doc.length > 0 && await TextEditor.JavaScript.isExpressionComplete(state.doc.toString());
    }
    async handleEnter() {
        if (await this.enterWillEvaluate()) {
            this.appendCommand(this.text(), true);
            TextEditor.JavaScript.closeArgumentsHintsTooltip(this.editor.editor, this.#argumentHintsState);
            this.editor.dispatch({
                changes: { from: 0, to: this.editor.state.doc.length },
                scrollIntoView: true,
            });
        }
        else if (this.editor.state.doc.length) {
            CodeMirror.insertNewlineAndIndent(this.editor.editor);
        }
        else {
            this.editor.dispatch({ scrollIntoView: true });
        }
    }
    updatePromptIcon() {
        void this.iconThrottler.schedule(async () => {
            this.promptIcon.classList.toggle('console-prompt-incomplete', !(await this.enterWillEvaluate()));
        });
    }
    appendCommand(text, useCommandLineAPI) {
        const currentExecutionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        if (currentExecutionContext) {
            const executionContext = currentExecutionContext;
            const message = SDK.ConsoleModel.ConsoleModel.instance().addCommandMessage(executionContext, text);
            const expression = ObjectUI.JavaScriptREPL.JavaScriptREPL.preprocessExpression(text);
            void this.evaluateCommandInConsole(executionContext, message, expression, useCommandLineAPI);
            if (ConsolePanel.instance().isShowing()) {
                Host.userMetrics.actionTaken(Host.UserMetrics.Action.CommandEvaluatedInConsolePanel);
            }
        }
    }
    async evaluateCommandInConsole(executionContext, message, expression, useCommandLineAPI) {
        if (Root.Runtime.experiments.isEnabled('evaluateExpressionsWithSourceMaps')) {
            const callFrame = executionContext.debuggerModel.selectedCallFrame();
            if (callFrame) {
                const nameMap = await SourceMapScopes.NamesResolver.allVariablesInCallFrame(callFrame);
                expression = await this.substituteNames(expression, nameMap);
            }
        }
        await SDK.ConsoleModel.ConsoleModel.instance().evaluateCommandInConsole(executionContext, message, expression, useCommandLineAPI);
    }
    async substituteNames(expression, mapping) {
        try {
            return await Formatter.FormatterWorkerPool.formatterWorkerPool().javaScriptSubstitute(expression, mapping);
        }
        catch {
            return expression;
        }
    }
    editorUpdate(update) {
        if (update.docChanged ||
            CodeMirror.selectedCompletion(update.state) !== CodeMirror.selectedCompletion(update.startState)) {
            this.onTextChanged();
        }
        else if (update.selectionSet) {
            this.updatePromptIcon();
        }
    }
    historyCompletions(context) {
        const text = this.text();
        if (!this.addCompletionsFromHistory || !this.isCaretAtEndOfPrompt() || (!text.length && !context.explicit)) {
            return null;
        }
        const result = [];
        const set = new Set();
        const data = this.historyInternal.historyData();
        for (let i = data.length - 1; i >= 0 && result.length < 50; --i) {
            const item = data[i];
            if (!item.startsWith(text)) {
                continue;
            }
            if (set.has(item)) {
                continue;
            }
            set.add(item);
            result.push({ label: item, type: 'secondary', boost: -1e5 });
        }
        return result.length ? {
            from: 0,
            to: text.length,
            options: result,
        } :
            null;
    }
    focus() {
        this.editor.focus();
    }
    editorSetForTest() {
    }
}
export class ConsoleHistoryManager {
    data;
    historyOffset;
    uncommittedIsTop;
    constructor() {
        this.data = [];
        /**
         * 1-based entry in the history stack.
         */
        this.historyOffset = 1;
    }
    historyData() {
        return this.data;
    }
    setHistoryData(data) {
        this.data = data.slice();
        this.historyOffset = 1;
    }
    /**
     * Pushes a committed text into the history.
     */
    pushHistoryItem(text) {
        if (this.uncommittedIsTop) {
            this.data.pop();
            delete this.uncommittedIsTop;
        }
        this.historyOffset = 1;
        if (text === this.currentHistoryItem()) {
            return;
        }
        this.data.push(text);
    }
    /**
     * Pushes the current (uncommitted) text into the history.
     */
    pushCurrentText(currentText) {
        if (this.uncommittedIsTop) {
            this.data.pop();
        } // Throw away obsolete uncommitted text.
        this.uncommittedIsTop = true;
        this.data.push(currentText);
    }
    previous(currentText) {
        if (this.historyOffset > this.data.length) {
            return undefined;
        }
        if (this.historyOffset === 1) {
            this.pushCurrentText(currentText);
        }
        ++this.historyOffset;
        return this.currentHistoryItem();
    }
    next() {
        if (this.historyOffset === 1) {
            return undefined;
        }
        --this.historyOffset;
        return this.currentHistoryItem();
    }
    currentHistoryItem() {
        return this.data[this.data.length - this.historyOffset];
    }
}
//# sourceMappingURL=ConsolePrompt.js.map