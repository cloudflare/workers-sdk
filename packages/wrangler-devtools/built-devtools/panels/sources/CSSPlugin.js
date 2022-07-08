// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as ColorPicker from '../../ui/legacy/components/color_picker/color_picker.js';
import * as InlineEditor from '../../ui/legacy/components/inline_editor/inline_editor.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import * as UI from '../../ui/legacy/legacy.js';
import { assertNotNullOrUndefined } from '../../core/platform/platform.js';
import { Plugin } from './Plugin.js';
// Plugin to add CSS completion, shortcuts, and color/curve swatches
// to editors with CSS content.
const UIStrings = {
    /**
    *@description Swatch icon element title in CSSPlugin of the Sources panel
    */
    openColorPicker: 'Open color picker.',
    /**
    *@description Text to open the cubic bezier editor
    */
    openCubicBezierEditor: 'Open cubic bezier editor.',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/CSSPlugin.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const dontCompleteIn = new Set(['ColorLiteral', 'NumberLiteral', 'StringLiteral', 'Comment', 'Important']);
function findPropertyAt(node, pos) {
    if (dontCompleteIn.has(node.name)) {
        return null;
    }
    for (let cur = node; cur; cur = cur.parent) {
        if (cur.name === 'StyleSheet') {
            break;
        }
        else if (cur.name === 'Declaration') {
            const name = cur.getChild('PropertyName'), colon = cur.getChild(':');
            return name && colon && colon.to <= pos ? name : null;
        }
    }
    return null;
}
function getCurrentStyleSheet(url, cssModel) {
    const currentStyleSheet = cssModel.getStyleSheetIdsForURL(url);
    if (currentStyleSheet.length === 0) {
        Platform.DCHECK(() => currentStyleSheet.length !== 0, 'Can\'t find style sheet ID for current URL');
    }
    return currentStyleSheet[0];
}
async function specificCssCompletion(cx, uiSourceCode, cssModel) {
    const node = CodeMirror.syntaxTree(cx.state).resolveInner(cx.pos, -1);
    if (node.name === 'ClassName') {
        // Should never happen, but let's code defensively here
        assertNotNullOrUndefined(cssModel);
        const currentStyleSheet = getCurrentStyleSheet(uiSourceCode.url(), cssModel);
        const existingClassNames = await cssModel.getClassNames(currentStyleSheet);
        return {
            from: node.from,
            options: existingClassNames.map(value => ({ type: 'constant', label: value })),
        };
    }
    const property = findPropertyAt(node, cx.pos);
    if (property) {
        const propertyValues = SDK.CSSMetadata.cssMetadata().getPropertyValues(cx.state.sliceDoc(property.from, property.to));
        return {
            from: node.name === 'ValueName' ? node.from : cx.pos,
            options: propertyValues.map(value => ({ type: 'constant', label: value })),
            validFor: /^[\w\P{ASCII}\-]+$/u,
        };
    }
    return null;
}
function findColorsAndCurves(state, from, to, onColor, onCurve) {
    let line = state.doc.lineAt(from);
    function getToken(from, to) {
        if (from >= line.to) {
            line = state.doc.lineAt(from);
        }
        return line.text.slice(from - line.from, to - line.from);
    }
    const tree = CodeMirror.ensureSyntaxTree(state, to, 100);
    if (!tree) {
        return;
    }
    tree.iterate({
        from,
        to,
        enter: node => {
            let content;
            if (node.name === 'ValueName' || node.name === 'ColorLiteral') {
                content = getToken(node.from, node.to);
            }
            else if (node.name === 'Callee' && /^(?:(?:rgb|hsl)a?|cubic-bezier)$/.test(getToken(node.from, node.to))) {
                content = state.sliceDoc(node.from, node.node.parent.to);
            }
            if (content) {
                const parsedColor = Common.Color.Color.parse(content);
                if (parsedColor) {
                    onColor(node.from, parsedColor, content);
                }
                else {
                    const parsedCurve = UI.Geometry.CubicBezier.parse(content);
                    if (parsedCurve) {
                        onCurve(node.from, parsedCurve, content);
                    }
                }
            }
        },
    });
}
class ColorSwatchWidget extends CodeMirror.WidgetType {
    color;
    text;
    constructor(color, text) {
        super();
        this.color = color;
        this.text = text;
    }
    eq(other) {
        return this.color.equal(other.color) && this.text === other.text;
    }
    toDOM(view) {
        const swatch = new InlineEditor.ColorSwatch.ColorSwatch();
        swatch.renderColor(this.color, false, i18nString(UIStrings.openColorPicker));
        const value = swatch.createChild('span');
        value.textContent = this.text;
        value.setAttribute('hidden', 'true');
        swatch.addEventListener(InlineEditor.ColorSwatch.ClickEvent.eventName, event => {
            event.consume(true);
            view.dispatch({
                effects: setTooltip.of({
                    type: 0 /* Color */,
                    pos: view.posAtDOM(swatch),
                    text: this.text,
                    swatch,
                    color: this.color,
                }),
            });
        });
        return swatch;
    }
    ignoreEvent() {
        return true;
    }
}
class CurveSwatchWidget extends CodeMirror.WidgetType {
    curve;
    text;
    constructor(curve, text) {
        super();
        this.curve = curve;
        this.text = text;
    }
    eq(other) {
        return this.curve.asCSSText() === other.curve.asCSSText() && this.text === other.text;
    }
    toDOM(view) {
        const swatch = InlineEditor.Swatches.BezierSwatch.create();
        swatch.setBezierText(this.text);
        UI.Tooltip.Tooltip.install(swatch.iconElement(), i18nString(UIStrings.openCubicBezierEditor));
        swatch.iconElement().addEventListener('click', (event) => {
            event.consume(true);
            view.dispatch({
                effects: setTooltip.of({
                    type: 1 /* Curve */,
                    pos: view.posAtDOM(swatch),
                    text: this.text,
                    swatch,
                    curve: this.curve,
                }),
            });
        }, false);
        swatch.hideText(true);
        return swatch;
    }
    ignoreEvent() {
        return true;
    }
}
function createCSSTooltip(active) {
    return {
        pos: active.pos,
        arrow: true,
        create(view) {
            let text = active.text;
            let widget, addListener;
            if (active.type === 0 /* Color */) {
                const spectrum = new ColorPicker.Spectrum.Spectrum();
                addListener = (handler) => {
                    spectrum.addEventListener(ColorPicker.Spectrum.Events.ColorChanged, handler);
                };
                spectrum.addEventListener(ColorPicker.Spectrum.Events.SizeChanged, () => view.requestMeasure());
                spectrum.setColor(active.color, active.color.format());
                widget = spectrum;
            }
            else {
                const spectrum = new InlineEditor.BezierEditor.BezierEditor(active.curve);
                widget = spectrum;
                addListener = (handler) => {
                    spectrum.addEventListener(InlineEditor.BezierEditor.Events.BezierChanged, handler);
                };
            }
            const dom = document.createElement('div');
            dom.className = 'cm-tooltip-swatchEdit';
            widget.markAsRoot();
            widget.show(dom);
            widget.showWidget();
            widget.element.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    event.consume();
                    view.dispatch({
                        effects: setTooltip.of(null),
                        changes: text === active.text ? undefined :
                            { from: active.pos, to: active.pos + text.length, insert: active.text },
                    });
                    widget.hideWidget();
                    view.focus();
                }
            });
            widget.element.addEventListener('focusout', event => {
                if (event.relatedTarget && !widget.element.contains(event.relatedTarget)) {
                    view.dispatch({ effects: setTooltip.of(null) });
                    widget.hideWidget();
                }
            }, false);
            widget.element.addEventListener('mousedown', event => event.consume());
            return {
                dom,
                offset: { x: -8, y: 0 },
                mount: () => {
                    widget.focus();
                    widget.wasShown();
                    addListener((event) => {
                        view.dispatch({
                            changes: { from: active.pos, to: active.pos + text.length, insert: event.data },
                            annotations: isSwatchEdit.of(true),
                        });
                        text = event.data;
                    });
                },
            };
        },
    };
}
const setTooltip = CodeMirror.StateEffect.define();
const isSwatchEdit = CodeMirror.Annotation.define();
const cssTooltipState = CodeMirror.StateField.define({
    create() {
        return null;
    },
    update(value, tr) {
        if ((tr.docChanged || tr.selection) && !tr.annotation(isSwatchEdit)) {
            value = null;
        }
        for (const effect of tr.effects) {
            if (effect.is(setTooltip)) {
                value = effect.value;
            }
        }
        return value;
    },
    provide: field => CodeMirror.showTooltip.from(field, active => active && createCSSTooltip(active)),
});
function computeSwatchDeco(state, from, to) {
    const builder = new CodeMirror.RangeSetBuilder();
    findColorsAndCurves(state, from, to, (pos, color, text) => {
        builder.add(pos, pos, CodeMirror.Decoration.widget({ widget: new ColorSwatchWidget(color, text) }));
    }, (pos, curve, text) => {
        builder.add(pos, pos, CodeMirror.Decoration.widget({ widget: new CurveSwatchWidget(curve, text) }));
    });
    return builder.finish();
}
const cssSwatchPlugin = CodeMirror.ViewPlugin.fromClass(class {
    decorations;
    constructor(view) {
        this.decorations = computeSwatchDeco(view.state, view.viewport.from, view.viewport.to);
    }
    update(update) {
        if (update.viewportChanged || update.docChanged) {
            this.decorations = computeSwatchDeco(update.state, update.view.viewport.from, update.view.viewport.to);
        }
    }
}, {
    decorations: v => v.decorations,
});
function cssSwatches() {
    return [cssSwatchPlugin, cssTooltipState];
}
function getNumberAt(node) {
    if (node.name === 'Unit') {
        node = node.parent;
    }
    if (node.name === 'NumberLiteral') {
        const lastChild = node.lastChild;
        return { from: node.from, to: lastChild && lastChild.name === 'Unit' ? lastChild.from : node.to };
    }
    return null;
}
function modifyUnit(view, by) {
    const { head } = view.state.selection.main;
    const context = CodeMirror.syntaxTree(view.state).resolveInner(head, -1);
    const numberRange = getNumberAt(context) || getNumberAt(context.resolve(head, 1));
    if (!numberRange) {
        return false;
    }
    const currentNumber = Number(view.state.sliceDoc(numberRange.from, numberRange.to));
    if (isNaN(currentNumber)) {
        return false;
    }
    view.dispatch({
        changes: { from: numberRange.from, to: numberRange.to, insert: String(currentNumber + by) },
        scrollIntoView: true,
        userEvent: 'insert.modifyUnit',
    });
    return true;
}
export function cssBindings() {
    // This is an awkward way to pass the argument given to the editor
    // event handler through the ShortcutRegistry calling convention.
    let currentView = null;
    const listener = UI.ShortcutRegistry.ShortcutRegistry.instance().getShortcutListener({
        'sources.increment-css': () => Promise.resolve(modifyUnit(currentView, 1)),
        'sources.increment-css-by-ten': () => Promise.resolve(modifyUnit(currentView, 10)),
        'sources.decrement-css': () => Promise.resolve(modifyUnit(currentView, -1)),
        'sources.decrement-css-by-ten': () => Promise.resolve(modifyUnit(currentView, -10)),
    });
    return CodeMirror.EditorView.domEventHandlers({
        keydown: (event, view) => {
            const prevView = currentView;
            currentView = view;
            listener(event);
            currentView = prevView;
            return event.defaultPrevented;
        },
    });
}
export class CSSPlugin extends Plugin {
    #cssModel;
    constructor(uiSourceCode, _transformer) {
        super(uiSourceCode, _transformer);
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.CSSModel.CSSModel, this);
    }
    static accepts(uiSourceCode) {
        return uiSourceCode.contentType().isStyleSheet();
    }
    modelAdded(cssModel) {
        if (this.#cssModel) {
            return;
        }
        this.#cssModel = cssModel;
    }
    modelRemoved(cssModel) {
        if (this.#cssModel === cssModel) {
            this.#cssModel = undefined;
        }
    }
    editorExtension() {
        return [cssBindings(), this.#cssCompletion(), cssSwatches()];
    }
    #cssCompletion() {
        const { cssCompletionSource } = CodeMirror.css;
        // CodeMirror binds the function below to the state object.
        // Therefore, we can't access `this` and retrieve the following properties.
        // Instead, retrieve them up front to bind them to the correct closure.
        const uiSourceCode = this.uiSourceCode;
        const cssModel = this.#cssModel;
        return CodeMirror.autocompletion({
            override: [async (cx) => {
                    return (await specificCssCompletion(cx, uiSourceCode, cssModel)) || cssCompletionSource(cx);
                }],
        });
    }
}
//# sourceMappingURL=CSSPlugin.js.map