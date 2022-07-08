// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as TextEditor from '../../ui/components/text_editor/text_editor.js';
import * as ObjectUI from '../../ui/legacy/components/object_ui/object_ui.js';
// eslint-disable-next-line rulesdir/es_modules_import
import objectValueStyles from '../../ui/legacy/components/object_ui/objectValue.css.js';
import * as UI from '../../ui/legacy/legacy.js';
import consolePinPaneStyles from './consolePinPane.css.js';
const UIStrings = {
    /**
    *@description A context menu item in the Console Pin Pane of the Console panel
    */
    removeExpression: 'Remove expression',
    /**
    *@description A context menu item in the Console Pin Pane of the Console panel
    */
    removeAllExpressions: 'Remove all expressions',
    /**
    *@description Screen reader label for delete button on a non-blank live expression
    *@example {document} PH1
    */
    removeExpressionS: 'Remove expression: {PH1}',
    /**
    *@description Screen reader label for delete button on a blank live expression
    */
    removeBlankExpression: 'Remove blank expression',
    /**
    *@description Text in Console Pin Pane of the Console panel
    */
    liveExpressionEditor: 'Live expression editor',
    /**
    *@description Text in Console Pin Pane of the Console panel
    */
    expression: 'Expression',
    /**
    *@description Side effect label title in Console Pin Pane of the Console panel
    */
    evaluateAllowingSideEffects: 'Evaluate, allowing side effects',
    /**
    *@description Text of a DOM element in Console Pin Pane of the Console panel
    */
    notAvailable: 'not available',
};
const str_ = i18n.i18n.registerUIStrings('panels/console/ConsolePinPane.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const elementToConsolePin = new WeakMap();
export class ConsolePinPane extends UI.ThrottledWidget.ThrottledWidget {
    liveExpressionButton;
    focusOut;
    pins;
    pinsSetting;
    constructor(liveExpressionButton, focusOut) {
        super(true, 250);
        this.liveExpressionButton = liveExpressionButton;
        this.focusOut = focusOut;
        this.contentElement.classList.add('console-pins', 'monospace');
        this.contentElement.addEventListener('contextmenu', this.contextMenuEventFired.bind(this), false);
        this.pins = new Set();
        this.pinsSetting = Common.Settings.Settings.instance().createLocalSetting('consolePins', []);
        for (const expression of this.pinsSetting.get()) {
            this.addPin(expression);
        }
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([consolePinPaneStyles, objectValueStyles]);
    }
    willHide() {
        for (const pin of this.pins) {
            pin.setHovered(false);
        }
    }
    savePins() {
        const toSave = Array.from(this.pins).map(pin => pin.expression());
        this.pinsSetting.set(toSave);
    }
    contextMenuEventFired(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        const target = UI.UIUtils.deepElementFromEvent(event);
        if (target) {
            const targetPinElement = target.enclosingNodeOrSelfWithClass('console-pin');
            if (targetPinElement) {
                const targetPin = elementToConsolePin.get(targetPinElement);
                if (targetPin) {
                    contextMenu.editSection().appendItem(i18nString(UIStrings.removeExpression), this.removePin.bind(this, targetPin));
                    targetPin.appendToContextMenu(contextMenu);
                }
            }
        }
        contextMenu.editSection().appendItem(i18nString(UIStrings.removeAllExpressions), this.removeAllPins.bind(this));
        void contextMenu.show();
    }
    removeAllPins() {
        for (const pin of this.pins) {
            this.removePin(pin);
        }
    }
    removePin(pin) {
        pin.element().remove();
        const newFocusedPin = this.focusedPinAfterDeletion(pin);
        this.pins.delete(pin);
        this.savePins();
        if (newFocusedPin) {
            void newFocusedPin.focus();
        }
        else {
            this.liveExpressionButton.focus();
        }
    }
    addPin(expression, userGesture) {
        const pin = new ConsolePin(expression, this, this.focusOut);
        this.contentElement.appendChild(pin.element());
        this.pins.add(pin);
        this.savePins();
        if (userGesture) {
            void pin.focus();
        }
        this.update();
    }
    focusedPinAfterDeletion(deletedPin) {
        const pinArray = Array.from(this.pins);
        for (let i = 0; i < pinArray.length; i++) {
            if (pinArray[i] === deletedPin) {
                if (pinArray.length === 1) {
                    return null;
                }
                if (i === pinArray.length - 1) {
                    return pinArray[i - 1];
                }
                return pinArray[i + 1];
            }
        }
        return null;
    }
    async doUpdate() {
        if (!this.pins.size || !this.isShowing()) {
            return;
        }
        if (this.isShowing()) {
            this.update();
        }
        const updatePromises = Array.from(this.pins, pin => pin.updatePreview());
        await Promise.all(updatePromises);
        this.updatedForTest();
    }
    updatedForTest() {
    }
}
export class ConsolePin {
    pinPane;
    focusOut;
    pinElement;
    pinPreview;
    lastResult;
    lastExecutionContext;
    editor;
    committedExpression;
    hovered;
    lastNode;
    deletePinIcon;
    constructor(expression, pinPane, focusOut) {
        this.pinPane = pinPane;
        this.focusOut = focusOut;
        this.deletePinIcon = document.createElement('div', { is: 'dt-close-button' });
        this.deletePinIcon.gray = true;
        this.deletePinIcon.classList.add('close-button');
        this.deletePinIcon.setTabbable(true);
        if (expression.length) {
            this.deletePinIcon.setAccessibleName(i18nString(UIStrings.removeExpressionS, { PH1: expression }));
        }
        else {
            this.deletePinIcon.setAccessibleName(i18nString(UIStrings.removeBlankExpression));
        }
        self.onInvokeElement(this.deletePinIcon, event => {
            pinPane.removePin(this);
            event.consume(true);
        });
        const fragment = UI.Fragment.Fragment.build `
  <div class='console-pin'>
  ${this.deletePinIcon}
  <div class='console-pin-name' $='name'></div>
  <div class='console-pin-preview' $='preview'></div>
  </div>`;
        this.pinElement = fragment.element();
        this.pinPreview = fragment.$('preview');
        const nameElement = fragment.$('name');
        UI.Tooltip.Tooltip.install(nameElement, expression);
        elementToConsolePin.set(this.pinElement, this);
        this.lastResult = null;
        this.lastExecutionContext = null;
        this.committedExpression = expression;
        this.hovered = false;
        this.lastNode = null;
        this.editor = this.createEditor(expression, nameElement);
        this.pinPreview.addEventListener('mouseenter', this.setHovered.bind(this, true), false);
        this.pinPreview.addEventListener('mouseleave', this.setHovered.bind(this, false), false);
        this.pinPreview.addEventListener('click', (event) => {
            if (this.lastNode) {
                void Common.Revealer.reveal(this.lastNode);
                event.consume();
            }
        }, false);
        // Prevent Esc from toggling the drawer
        nameElement.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.consume();
            }
        });
    }
    createEditor(expression, parent) {
        const editor = new TextEditor.TextEditor.TextEditor(CodeMirror.EditorState.create({
            doc: expression,
            extensions: [
                CodeMirror.EditorView.contentAttributes.of({ 'aria-label': i18nString(UIStrings.liveExpressionEditor) }),
                CodeMirror.EditorView.lineWrapping,
                CodeMirror.javascript.javascriptLanguage,
                TextEditor.JavaScript.completion(),
                TextEditor.Config.showCompletionHint,
                CodeMirror.placeholder(i18nString(UIStrings.expression)),
                CodeMirror.keymap.of([
                    {
                        key: 'Escape',
                        run: (view) => {
                            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: this.committedExpression } });
                            this.focusOut();
                            return true;
                        },
                    },
                    {
                        key: 'Enter',
                        run: () => {
                            this.focusOut();
                            return true;
                        },
                    },
                    {
                        key: 'Mod-Enter',
                        run: () => {
                            this.focusOut();
                            return true;
                        },
                    },
                ]),
                CodeMirror.EditorView.domEventHandlers({ blur: (_e, view) => this.onBlur(view) }),
                TextEditor.Config.baseConfiguration(expression),
                TextEditor.Config.closeBrackets,
                TextEditor.Config.autocompletion,
            ],
        }));
        parent.appendChild(editor);
        return editor;
    }
    onBlur(editor) {
        const text = editor.state.doc.toString();
        const trimmedText = text.trim();
        this.committedExpression = trimmedText;
        this.pinPane.savePins();
        if (this.committedExpression.length) {
            this.deletePinIcon.setAccessibleName(i18nString(UIStrings.removeExpressionS, { PH1: this.committedExpression }));
        }
        else {
            this.deletePinIcon.setAccessibleName(i18nString(UIStrings.removeBlankExpression));
        }
        editor.dispatch({
            selection: { anchor: trimmedText.length },
            changes: trimmedText !== text ? { from: 0, to: text.length, insert: trimmedText } : undefined,
        });
    }
    setHovered(hovered) {
        if (this.hovered === hovered) {
            return;
        }
        this.hovered = hovered;
        if (!hovered && this.lastNode) {
            SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
        }
    }
    expression() {
        return this.committedExpression;
    }
    element() {
        return this.pinElement;
    }
    async focus() {
        const editor = this.editor;
        editor.editor.focus();
        editor.dispatch({ selection: { anchor: editor.state.doc.length } });
    }
    appendToContextMenu(contextMenu) {
        if (this.lastResult && !('error' in this.lastResult) && this.lastResult.object) {
            contextMenu.appendApplicableItems(this.lastResult.object);
            // Prevent result from being released manually. It will release along with 'console' group.
            this.lastResult = null;
        }
    }
    async updatePreview() {
        if (!this.editor) {
            return;
        }
        const text = TextEditor.Config.contentIncludingHint(this.editor.editor);
        const isEditing = this.pinElement.hasFocus();
        const throwOnSideEffect = isEditing && text !== this.committedExpression;
        const timeout = throwOnSideEffect ? 250 : undefined;
        const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        const preprocessedExpression = ObjectUI.JavaScriptREPL.JavaScriptREPL.preprocessExpression(text);
        const { preview, result } = await ObjectUI.JavaScriptREPL.JavaScriptREPL.evaluateAndBuildPreview(preprocessedExpression, throwOnSideEffect, false /* replMode */, timeout, !isEditing /* allowErrors */, 'console', true /* awaitPromise */);
        if (this.lastResult && this.lastExecutionContext) {
            this.lastExecutionContext.runtimeModel.releaseEvaluationResult(this.lastResult);
        }
        this.lastResult = result || null;
        this.lastExecutionContext = executionContext || null;
        const previewText = preview.deepTextContent();
        if (!previewText || previewText !== this.pinPreview.deepTextContent()) {
            this.pinPreview.removeChildren();
            if (result && SDK.RuntimeModel.RuntimeModel.isSideEffectFailure(result)) {
                const sideEffectLabel = this.pinPreview.createChild('span', 'object-value-calculate-value-button');
                sideEffectLabel.textContent = '(…)';
                UI.Tooltip.Tooltip.install(sideEffectLabel, i18nString(UIStrings.evaluateAllowingSideEffects));
            }
            else if (previewText) {
                this.pinPreview.appendChild(preview);
            }
            else if (!isEditing) {
                UI.UIUtils.createTextChild(this.pinPreview, i18nString(UIStrings.notAvailable));
            }
            UI.Tooltip.Tooltip.install(this.pinPreview, previewText);
        }
        let node = null;
        if (result && !('error' in result) && result.object.type === 'object' && result.object.subtype === 'node') {
            node = result.object;
        }
        if (this.hovered) {
            if (node) {
                SDK.OverlayModel.OverlayModel.highlightObjectAsDOMNode(node);
            }
            else if (this.lastNode) {
                SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
            }
        }
        this.lastNode = node || null;
        const isError = result && !('error' in result) && result.exceptionDetails &&
            !SDK.RuntimeModel.RuntimeModel.isSideEffectFailure(result);
        this.pinElement.classList.toggle('error-level', Boolean(isError));
    }
}
//# sourceMappingURL=ConsolePinPane.js.map