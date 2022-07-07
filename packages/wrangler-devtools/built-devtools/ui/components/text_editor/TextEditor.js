// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as WindowBoundsService from '../../../services/window_bounds/window_bounds.js';
import * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
import * as ThemeSupport from '../../legacy/theme_support/theme_support.js';
import * as LitHtml from '../../lit-html/lit-html.js';
import * as CodeHighlighter from '../code_highlighter/code_highlighter.js';
import * as ComponentHelpers from '../helpers/helpers.js';
import { baseConfiguration, dummyDarkTheme, dynamicSetting, DynamicSetting, themeSelection } from './config.js';
import { toLineColumn, toOffset } from './position.js';
export class TextEditor extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-text-editor`;
    #shadow = this.attachShadow({ mode: 'open' });
    #activeEditor = undefined;
    #dynamicSettings = DynamicSetting.none;
    #activeSettingListeners = [];
    #pendingState;
    #lastScrollPos = { left: 0, top: 0 };
    #resizeTimeout = -1;
    #resizeListener = () => {
        if (this.#resizeTimeout < 0) {
            this.#resizeTimeout = window.setTimeout(() => {
                this.#resizeTimeout = -1;
                if (this.#activeEditor) {
                    CodeMirror.repositionTooltips(this.#activeEditor);
                }
            }, 50);
        }
    };
    #devtoolsResizeObserver = new ResizeObserver(this.#resizeListener);
    constructor(pendingState) {
        super();
        this.#pendingState = pendingState;
        this.#shadow.adoptedStyleSheets = [CodeHighlighter.Style.default];
    }
    #createEditor() {
        this.#activeEditor = new CodeMirror.EditorView({
            state: this.state,
            parent: this.#shadow,
            root: this.#shadow,
            dispatch: (tr) => {
                this.editor.update([tr]);
                if (tr.reconfigured) {
                    this.#ensureSettingListeners();
                }
            },
        });
        this.#activeEditor.scrollDOM.scrollTop = this.#lastScrollPos.top;
        this.#activeEditor.scrollDOM.scrollLeft = this.#lastScrollPos.left;
        this.#activeEditor.scrollDOM.addEventListener('scroll', (event) => {
            this.#lastScrollPos.left = event.target.scrollLeft;
            this.#lastScrollPos.top = event.target.scrollTop;
        });
        this.#ensureSettingListeners();
        this.#startObservingResize();
        ThemeSupport.ThemeSupport.instance().addEventListener(ThemeSupport.ThemeChangeEvent.eventName, () => {
            const currentTheme = ThemeSupport.ThemeSupport.instance().themeName() === 'dark' ? dummyDarkTheme : [];
            this.editor.dispatch({
                effects: themeSelection.reconfigure(currentTheme),
            });
        });
        return this.#activeEditor;
    }
    get editor() {
        return this.#activeEditor || this.#createEditor();
    }
    dispatch(spec) {
        return this.editor.dispatch(spec);
    }
    get state() {
        if (this.#activeEditor) {
            return this.#activeEditor.state;
        }
        if (!this.#pendingState) {
            this.#pendingState = CodeMirror.EditorState.create({ extensions: baseConfiguration('') });
        }
        return this.#pendingState;
    }
    set state(state) {
        if (this.#activeEditor) {
            this.#activeEditor.setState(state);
        }
        else {
            this.#pendingState = state;
        }
    }
    connectedCallback() {
        if (!this.#activeEditor) {
            this.#createEditor();
        }
    }
    disconnectedCallback() {
        if (this.#activeEditor) {
            this.#pendingState = this.#activeEditor.state;
            this.#devtoolsResizeObserver.disconnect();
            window.removeEventListener('resize', this.#resizeListener);
            this.#activeEditor.destroy();
            this.#activeEditor = undefined;
            this.#ensureSettingListeners();
        }
    }
    focus() {
        if (this.#activeEditor) {
            this.#activeEditor.focus();
        }
    }
    #ensureSettingListeners() {
        const dynamicSettings = this.#activeEditor ? this.#activeEditor.state.facet(dynamicSetting) : DynamicSetting.none;
        if (dynamicSettings === this.#dynamicSettings) {
            return;
        }
        this.#dynamicSettings = dynamicSettings;
        for (const [setting, listener] of this.#activeSettingListeners) {
            setting.removeChangeListener(listener);
        }
        this.#activeSettingListeners = [];
        const settings = Common.Settings.Settings.instance();
        for (const dynamicSetting of dynamicSettings) {
            const handler = ({ data }) => {
                const change = dynamicSetting.sync(this.state, data);
                if (change && this.#activeEditor) {
                    this.#activeEditor.dispatch({ effects: change });
                }
            };
            const setting = settings.moduleSetting(dynamicSetting.settingName);
            setting.addChangeListener(handler);
            this.#activeSettingListeners.push([setting, handler]);
        }
    }
    #startObservingResize() {
        const devtoolsElement = WindowBoundsService.WindowBoundsService.WindowBoundsServiceImpl.instance().getDevToolsBoundingElement();
        if (devtoolsElement) {
            this.#devtoolsResizeObserver.observe(devtoolsElement);
        }
        window.addEventListener('resize', this.#resizeListener);
    }
    revealPosition(selection, highlight = true) {
        const view = this.#activeEditor;
        if (!view) {
            return;
        }
        const line = view.state.doc.lineAt(selection.main.head);
        const effects = [];
        if (highlight) {
            effects.push(view.state.field(highlightState, false) ?
                setHighlightLine.of(line.from) :
                CodeMirror.StateEffect.appendConfig.of(highlightState.init(() => highlightDeco(line.from))));
        }
        const editorRect = view.scrollDOM.getBoundingClientRect();
        const targetPos = view.coordsAtPos(selection.main.head);
        if (!targetPos || targetPos.top < editorRect.top || targetPos.bottom > editorRect.bottom) {
            effects.push(CodeMirror.EditorView.scrollIntoView(selection.main, { y: 'center' }));
        }
        view.dispatch({
            selection,
            effects,
            userEvent: 'select.reveal',
        });
        if (highlight) {
            const { id } = view.state.field(highlightState);
            // Reset the highlight state if, after 2 seconds (the animation
            // duration) it is still showing this highlight.
            window.setTimeout(() => {
                if (view.state.field(highlightState).id === id) {
                    view.dispatch({ effects: setHighlightLine.of(null) });
                }
            }, 2000);
        }
    }
    createSelection(head, anchor) {
        const { doc } = this.state;
        const headPos = toOffset(doc, head);
        return CodeMirror.EditorSelection.single(anchor ? toOffset(doc, anchor) : headPos, headPos);
    }
    toLineColumn(pos) {
        return toLineColumn(this.state.doc, pos);
    }
    toOffset(pos) {
        return toOffset(this.state.doc, pos);
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-text-editor', TextEditor);
const setHighlightLine = CodeMirror.StateEffect.define({ map: (value, mapping) => value === null ? null : mapping.mapPos(value) });
function highlightDeco(position) {
    const deco = CodeMirror.Decoration.set([CodeMirror.Decoration.line({ attributes: { class: 'cm-highlightedLine' } }).range(position)]);
    return { deco, id: Math.floor(Math.random() * 0xfffff) };
}
const highlightState = CodeMirror.StateField.define({
    create: () => ({ deco: CodeMirror.Decoration.none, id: 0 }),
    update(value, tr) {
        if (!tr.changes.empty && value.deco.size) {
            value = { deco: value.deco.map(tr.changes), id: value.id };
        }
        for (const effect of tr.effects) {
            if (effect.is(setHighlightLine)) {
                value = effect.value === null ? { deco: CodeMirror.Decoration.none, id: 0 } : highlightDeco(effect.value);
            }
        }
        return value;
    },
    provide: field => CodeMirror.EditorView.decorations.from(field, value => value.deco),
});
//# sourceMappingURL=TextEditor.js.map