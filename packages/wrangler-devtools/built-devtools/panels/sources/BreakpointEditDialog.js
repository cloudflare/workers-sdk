// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as TextEditor from '../../ui/components/text_editor/text_editor.js';
import * as UI from '../../ui/legacy/legacy.js';
import breakpointEditDialogStyles from './breakpointEditDialog.css.js';
const UIStrings = {
    /**
    *@description Screen reader label for a select box that chooses the breakpoint type in the Sources panel when editing a breakpoint
    */
    breakpointType: 'Breakpoint type',
    /**
    *@description Text in Breakpoint Edit Dialog of the Sources panel
    */
    breakpoint: 'Breakpoint',
    /**
    *@description Text in Breakpoint Edit Dialog of the Sources panel
    */
    conditionalBreakpoint: 'Conditional breakpoint',
    /**
    *@description Text in Breakpoint Edit Dialog of the Sources panel
    */
    logpoint: 'Logpoint',
    /**
    *@description Text in Breakpoint Edit Dialog of the Sources panel
    */
    expressionToCheckBeforePausingEg: 'Expression to check before pausing, e.g. x > 5',
    /**
    *@description Type selector element title in Breakpoint Edit Dialog of the Sources panel
    */
    pauseOnlyWhenTheConditionIsTrue: 'Pause only when the condition is true',
    /**
    *@description Text in Breakpoint Edit Dialog of the Sources panel. It is used as
    *the placeholder for a text input field before the user enters text. Provides the user with
    *an example on how to use Logpoints. 'Log' is a verb and 'message' is a noun.
    *See: https://developer.chrome.com/blog/new-in-devtools-73/#logpoints
    */
    logMessageEgXIsX: 'Log message, e.g. `\'x is\', x`',
    /**
    *@description Type selector element title in Breakpoint Edit Dialog of the Sources panel
    */
    logAMessageToConsoleDoNotBreak: 'Log a message to Console, do not break',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/BreakpointEditDialog.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class BreakpointEditDialog extends UI.Widget.Widget {
    onFinish;
    finished;
    editor;
    isLogpoint;
    typeSelector;
    placeholderCompartment;
    constructor(editorLineNumber, oldCondition, preferLogpoint, onFinish) {
        super(true);
        const editorConfig = [
            CodeMirror.javascript.javascriptLanguage,
            TextEditor.Config.baseConfiguration(oldCondition || ''),
            TextEditor.Config.closeBrackets,
            TextEditor.Config.autocompletion,
            CodeMirror.EditorView.lineWrapping,
            TextEditor.Config.showCompletionHint,
            TextEditor.JavaScript.argumentHints(),
        ];
        this.onFinish = onFinish;
        this.finished = false;
        this.element.tabIndex = -1;
        const logpointPrefix = LogpointPrefix;
        const logpointSuffix = LogpointSuffix;
        this.isLogpoint = oldCondition.startsWith(logpointPrefix) && oldCondition.endsWith(logpointSuffix);
        if (this.isLogpoint) {
            oldCondition = oldCondition.substring(logpointPrefix.length, oldCondition.length - logpointSuffix.length);
        }
        this.isLogpoint = this.isLogpoint || preferLogpoint;
        this.element.classList.add('sources-edit-breakpoint-dialog');
        const toolbar = new UI.Toolbar.Toolbar('source-frame-breakpoint-toolbar', this.contentElement);
        toolbar.appendText(`Line ${editorLineNumber + 1}:`);
        this.typeSelector =
            new UI.Toolbar.ToolbarComboBox(this.onTypeChanged.bind(this), i18nString(UIStrings.breakpointType));
        this.typeSelector.createOption(i18nString(UIStrings.breakpoint), BreakpointType.Breakpoint);
        const conditionalOption = this.typeSelector.createOption(i18nString(UIStrings.conditionalBreakpoint), BreakpointType.Conditional);
        const logpointOption = this.typeSelector.createOption(i18nString(UIStrings.logpoint), BreakpointType.Logpoint);
        this.typeSelector.select(this.isLogpoint ? logpointOption : conditionalOption);
        toolbar.appendToolbarItem(this.typeSelector);
        const content = oldCondition || '';
        const finishIfComplete = (view) => {
            void TextEditor.JavaScript.isExpressionComplete(view.state.doc.toString()).then((complete) => {
                if (complete) {
                    this.finishEditing(true, this.editor.state.doc.toString());
                }
                else {
                    CodeMirror.insertNewlineAndIndent(view);
                }
            });
            return true;
        };
        const keymap = [
            {
                key: 'Mod-Enter',
                run: finishIfComplete,
            },
            {
                key: 'Enter',
                run: finishIfComplete,
            },
            {
                key: 'Shift-Enter',
                run: CodeMirror.insertNewlineAndIndent,
            },
            {
                key: 'Escape',
                run: () => {
                    this.finishEditing(false, '');
                    return true;
                },
            },
        ];
        this.placeholderCompartment = new CodeMirror.Compartment();
        const editorWrapper = this.contentElement.appendChild(document.createElement('div'));
        editorWrapper.classList.add('condition-editor');
        this.editor = new TextEditor.TextEditor.TextEditor(CodeMirror.EditorState.create({
            doc: content,
            selection: { anchor: 0, head: content.length },
            extensions: [
                this.placeholderCompartment.of(this.getPlaceholder()),
                CodeMirror.keymap.of(keymap),
                editorConfig,
            ],
        }));
        editorWrapper.appendChild(this.editor);
        this.updateTooltip();
        this.element.addEventListener('blur', event => {
            if (!event.relatedTarget ||
                (event.relatedTarget && !event.relatedTarget.isSelfOrDescendant(this.element))) {
                this.finishEditing(true, this.editor.state.doc.toString());
            }
        }, true);
    }
    focusEditor() {
        this.editor.editor.focus();
    }
    static conditionForLogpoint(condition) {
        return `${LogpointPrefix}${condition}${LogpointSuffix}`;
    }
    onTypeChanged() {
        const type = this.breakpointType;
        this.isLogpoint = type === BreakpointType.Logpoint;
        if (type === BreakpointType.Breakpoint) {
            this.finishEditing(true, '');
            return;
        }
        this.editor.dispatch({ effects: this.placeholderCompartment.reconfigure(this.getPlaceholder()) });
        this.updateTooltip();
    }
    get breakpointType() {
        const option = this.typeSelector.selectedOption();
        return option ? option.value : null;
    }
    getPlaceholder() {
        const type = this.breakpointType;
        if (type === BreakpointType.Conditional) {
            return CodeMirror.placeholder(i18nString(UIStrings.expressionToCheckBeforePausingEg));
        }
        if (type === BreakpointType.Logpoint) {
            return CodeMirror.placeholder(i18nString(UIStrings.logMessageEgXIsX));
        }
        return [];
    }
    updateTooltip() {
        const type = this.breakpointType;
        if (type === BreakpointType.Conditional) {
            UI.Tooltip.Tooltip.install((this.typeSelector.element), i18nString(UIStrings.pauseOnlyWhenTheConditionIsTrue));
        }
        else if (type === BreakpointType.Logpoint) {
            UI.Tooltip.Tooltip.install((this.typeSelector.element), i18nString(UIStrings.logAMessageToConsoleDoNotBreak));
        }
    }
    finishEditing(committed, condition) {
        if (this.finished) {
            return;
        }
        this.finished = true;
        this.editor.remove();
        if (this.isLogpoint) {
            condition = BreakpointEditDialog.conditionForLogpoint(condition);
        }
        void this.onFinish({ committed, condition });
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([breakpointEditDialogStyles]);
    }
}
export const LogpointPrefix = '/** DEVTOOLS_LOGPOINT */ console.log(';
export const LogpointSuffix = ')';
export const BreakpointType = {
    Breakpoint: 'Breakpoint',
    Conditional: 'Conditional',
    Logpoint: 'Logpoint',
};
//# sourceMappingURL=BreakpointEditDialog.js.map