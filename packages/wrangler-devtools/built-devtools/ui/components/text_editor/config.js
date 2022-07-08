// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as WindowBoundsService from '../../../services/window_bounds/window_bounds.js';
import * as CM from '../../../third_party/codemirror.next/codemirror.next.js';
import * as CodeHighlighter from '../code_highlighter/code_highlighter.js';
import * as Icon from '../icon_button/icon_button.js';
import { editorTheme } from './theme.js';
const LINES_TO_SCAN_FOR_INDENTATION_GUESSING = 1000;
const UIStrings = {
    /**
    *@description Label text for the editor
    */
    codeEditor: 'Code editor',
};
const str_ = i18n.i18n.registerUIStrings('ui/components/text_editor/config.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const empty = [];
export const dynamicSetting = CM.Facet.define();
// The code below is used to wire up dynamic settings to editors. When
// you include the result of calling `instance()` in an editor
// configuration, the TextEditor class will take care of listening to
// changes in the setting, and updating the configuration as
// appropriate.
export class DynamicSetting {
    settingName;
    getExtension;
    compartment = new CM.Compartment();
    constructor(settingName, getExtension) {
        this.settingName = settingName;
        this.getExtension = getExtension;
    }
    settingValue() {
        return Common.Settings.Settings.instance().moduleSetting(this.settingName).get();
    }
    instance() {
        return [
            this.compartment.of(this.getExtension(this.settingValue())),
            dynamicSetting.of(this),
        ];
    }
    sync(state, value) {
        const cur = this.compartment.get(state);
        const needed = this.getExtension(value);
        return cur === needed ? null : this.compartment.reconfigure(needed);
    }
    static bool(name, enabled, disabled = empty) {
        return new DynamicSetting(name, val => val ? enabled : disabled);
    }
    static none = [];
}
export const tabMovesFocus = DynamicSetting.bool('textEditorTabMovesFocus', [], CM.keymap.of([{
        key: 'Tab',
        run: (view) => view.state.doc.length ? CM.indentMore(view) : false,
        shift: (view) => view.state.doc.length ? CM.indentLess(view) : false,
    }]));
export const autocompletion = [
    CM.autocompletion({
        icons: false,
        optionClass: (option) => option.type === 'secondary' ? 'cm-secondaryCompletion' : '',
    }),
    CM.Prec.highest(CM.keymap.of([{ key: 'ArrowRight', run: CM.acceptCompletion }])),
];
export const sourcesAutocompletion = DynamicSetting.bool('textEditorAutocompletion', autocompletion);
export const bracketMatching = DynamicSetting.bool('textEditorBracketMatching', CM.bracketMatching());
export const codeFolding = DynamicSetting.bool('textEditorCodeFolding', [
    CM.foldGutter({
        markerDOM(open) {
            const iconName = open ? 'triangle-expanded' : 'triangle-collapsed';
            const icon = new Icon.Icon.Icon();
            icon.data = {
                iconName,
                color: 'var(--color-text-secondary)',
                width: '12px',
                height: '12px',
            };
            return icon;
        },
    }),
    CM.keymap.of(CM.foldKeymap),
]);
export function guessIndent(doc) {
    const values = Object.create(null);
    let scanned = 0;
    for (let cur = doc.iterLines(1, Math.min(doc.lines + 1, LINES_TO_SCAN_FOR_INDENTATION_GUESSING)); !cur.next().done;) {
        let space = /^\s*/.exec(cur.value)[0];
        if (space.length === cur.value.length || !space.length || cur.value[space.length] === '*') {
            continue;
        }
        if (space[0] === '\t') {
            space = '\t';
        }
        else if (/[^ ]/.test(space)) {
            continue;
        }
        scanned++;
        values[space] = (values[space] || 0) + 1;
    }
    const minOccurrence = scanned * 0.05;
    const shortest = Object.entries(values).reduce((shortest, [string, count]) => {
        return count < minOccurrence || shortest && shortest.length < string.length ? shortest : string;
    }, null);
    return shortest ?? Common.Settings.Settings.instance().moduleSetting('textEditorIndent').get();
}
const deriveIndentUnit = CM.Prec.highest(CM.indentUnit.compute([], (state) => guessIndent(state.doc)));
export const autoDetectIndent = DynamicSetting.bool('textEditorAutoDetectIndent', deriveIndentUnit);
function matcher(decorator) {
    return CM.ViewPlugin.define(view => ({
        decorations: decorator.createDeco(view),
        update(u) {
            this.decorations = decorator.updateDeco(u, this.decorations);
        },
    }), {
        decorations: v => v.decorations,
    });
}
const WhitespaceDeco = new Map();
function getWhitespaceDeco(space) {
    const cached = WhitespaceDeco.get(space);
    if (cached) {
        return cached;
    }
    const result = CM.Decoration.mark({
        attributes: space === '\t' ? {
            class: 'cm-highlightedTab',
        } :
            { class: 'cm-highlightedSpaces', 'data-display': '·'.repeat(space.length) },
    });
    WhitespaceDeco.set(space, result);
    return result;
}
const showAllWhitespace = matcher(new CM.MatchDecorator({
    regexp: /\t| +/g,
    decoration: (match) => getWhitespaceDeco(match[0]),
    boundary: /\S/,
}));
const showTrailingWhitespace = matcher(new CM.MatchDecorator({
    regexp: /\s+$/g,
    decoration: CM.Decoration.mark({ class: 'cm-trailingWhitespace' }),
    boundary: /\S/,
}));
export const showWhitespace = new DynamicSetting('showWhitespacesInEditor', value => {
    if (value === 'all') {
        return showAllWhitespace;
    }
    if (value === 'trailing') {
        return showTrailingWhitespace;
    }
    return empty;
});
export const allowScrollPastEof = DynamicSetting.bool('allowScrollPastEof', CM.scrollPastEnd());
const cachedIndentUnit = Object.create(null);
function getIndentUnit(indent) {
    let value = cachedIndentUnit[indent];
    if (!value) {
        value = cachedIndentUnit[indent] = CM.indentUnit.of(indent);
    }
    return value;
}
export const indentUnit = new DynamicSetting('textEditorIndent', getIndentUnit);
export const domWordWrap = DynamicSetting.bool('domWordWrap', CM.EditorView.lineWrapping);
function detectLineSeparator(text) {
    if (/\r\n/.test(text) && !/(^|[^\r])\n/.test(text)) {
        return CM.EditorState.lineSeparator.of('\r\n');
    }
    return [];
}
const baseKeymap = CM.keymap.of([
    { key: 'Tab', run: CM.acceptCompletion },
    { key: 'End', run: CM.acceptCompletion },
    { key: 'Ctrl-m', run: CM.cursorMatchingBracket, shift: CM.selectMatchingBracket },
    { key: 'Mod-/', run: CM.toggleComment },
    { key: 'Mod-d', run: CM.selectNextOccurrence },
    { key: 'Alt-ArrowLeft', mac: 'Ctrl-ArrowLeft', run: CM.cursorSubwordBackward, shift: CM.selectSubwordBackward },
    { key: 'Alt-ArrowRight', mac: 'Ctrl-ArrowRight', run: CM.cursorSubwordForward, shift: CM.selectSubwordForward },
    ...CM.standardKeymap,
    ...CM.historyKeymap,
]);
function themeIsDark() {
    const setting = Common.Settings.Settings.instance().moduleSetting('uiTheme').get();
    return setting === 'systemPreferred' ? window.matchMedia('(prefers-color-scheme: dark)').matches : setting === 'dark';
}
export const dummyDarkTheme = CM.EditorView.theme({}, { dark: true });
export const themeSelection = new CM.Compartment();
export function theme() {
    return [editorTheme, themeIsDark() ? themeSelection.of(dummyDarkTheme) : themeSelection.of([])];
}
let sideBarElement = null;
function getTooltipSpace() {
    if (!sideBarElement) {
        sideBarElement =
            WindowBoundsService.WindowBoundsService.WindowBoundsServiceImpl.instance().getDevToolsBoundingElement();
    }
    return sideBarElement.getBoundingClientRect();
}
export function baseConfiguration(text) {
    return [
        theme(),
        CM.highlightSpecialChars(),
        CM.highlightSelectionMatches(),
        CM.history(),
        CM.drawSelection(),
        CM.EditorState.allowMultipleSelections.of(true),
        CM.indentOnInput(),
        CM.syntaxHighlighting(CodeHighlighter.CodeHighlighter.highlightStyle),
        baseKeymap,
        CM.EditorView.clickAddsSelectionRange.of(mouseEvent => mouseEvent.altKey || mouseEvent.ctrlKey),
        tabMovesFocus.instance(),
        bracketMatching.instance(),
        indentUnit.instance(),
        CM.Prec.lowest(CM.EditorView.contentAttributes.of({ 'aria-label': i18nString(UIStrings.codeEditor) })),
        text instanceof CM.Text ? [] : detectLineSeparator(text),
        CM.tooltips({
            tooltipSpace: getTooltipSpace,
        }),
    ];
}
export const closeBrackets = [
    CM.closeBrackets(),
    CM.keymap.of(CM.closeBracketsKeymap),
];
class CompletionHint extends CM.WidgetType {
    text;
    constructor(text) {
        super();
        this.text = text;
    }
    eq(other) {
        return this.text === other.text;
    }
    toDOM() {
        const span = document.createElement('span');
        span.className = 'cm-completionHint';
        span.textContent = this.text;
        return span;
    }
}
export const showCompletionHint = CM.ViewPlugin.fromClass(class {
    decorations = CM.Decoration.none;
    currentHint = null;
    update(update) {
        const top = this.currentHint = this.topCompletion(update.state);
        if (!top) {
            this.decorations = CM.Decoration.none;
        }
        else {
            this.decorations = CM.Decoration.set([CM.Decoration.widget({ widget: new CompletionHint(top), side: 1 }).range(update.state.selection.main.head)]);
        }
    }
    topCompletion(state) {
        const completion = CM.selectedCompletion(state);
        if (!completion) {
            return null;
        }
        let { label, apply } = completion;
        if (typeof apply === 'string') {
            label = apply;
            apply = undefined;
        }
        if (apply || label.length > 100 || label.indexOf('\n') > -1 || completion.type === 'secondary') {
            return null;
        }
        const pos = state.selection.main.head;
        const lineBefore = state.doc.lineAt(pos);
        if (pos !== lineBefore.to) {
            return null;
        }
        const partBefore = (label[0] === '\'' ? /'(\\.|[^'\\])*$/ : label[0] === '"' ? /"(\\.|[^"\\])*$/ : /#?[\w$]+$/)
            .exec(lineBefore.text);
        if (partBefore && !label.startsWith(partBefore[0])) {
            return null;
        }
        return label.slice(partBefore ? partBefore[0].length : 0);
    }
}, { decorations: p => p.decorations });
export function contentIncludingHint(view) {
    const plugin = view.plugin(showCompletionHint);
    let content = view.state.doc.toString();
    if (plugin && plugin.currentHint) {
        const { head } = view.state.selection.main;
        content = content.slice(0, head) + plugin.currentHint + content.slice(head);
    }
    return content;
}
//# sourceMappingURL=config.js.map