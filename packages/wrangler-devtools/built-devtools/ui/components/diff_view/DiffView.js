// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Diff from '../../../third_party/diff/diff.js';
import * as LitHtml from '../../lit-html/lit-html.js';
import * as CodeHighlighter from '../code_highlighter/code_highlighter.js';
import * as ComponentHelpers from '../helpers/helpers.js';
import diffViewStyles from './diffView.css.js';
const UIStrings = {
    /**
    *@description Text prepended to a removed line in a diff in the Changes tool, viewable only by screen reader.
    */
    deletions: 'Deletion:',
    /**
    *@description Text prepended to a new line in a diff in the Changes tool, viewable only by screen reader.
    */
    additions: 'Addition:',
    /**
    *@description Screen-reader accessible name for the code editor in the Changes tool showing the user's changes.
    */
    changesDiffViewer: 'Changes diff viewer',
    /**
    *@description Text in Changes View of the Changes tab
    *@example {2} PH1
    */
    SkippingDMatchingLines: '( … Skipping {PH1} matching lines … )',
};
const str_ = i18n.i18n.registerUIStrings('ui/components/diff_view/DiffView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export function buildDiffRows(diff) {
    let currentLineNumber = 0;
    let originalLineNumber = 0;
    const paddingLines = 3;
    const originalLines = [];
    const currentLines = [];
    const rows = [];
    for (let i = 0; i < diff.length; ++i) {
        const token = diff[i];
        switch (token[0]) {
            case Diff.Diff.Operation.Equal:
                rows.push(...createEqualRows(token[1], i === 0, i === diff.length - 1));
                originalLines.push(...token[1]);
                currentLines.push(...token[1]);
                break;
            case Diff.Diff.Operation.Insert:
                for (const line of token[1]) {
                    rows.push(createRow(line, "addition" /* Addition */));
                }
                currentLines.push(...token[1]);
                break;
            case Diff.Diff.Operation.Delete:
                originalLines.push(...token[1]);
                if (diff[i + 1] && diff[i + 1][0] === Diff.Diff.Operation.Insert) {
                    i++;
                    rows.push(...createModifyRows(token[1].join('\n'), diff[i][1].join('\n')));
                    currentLines.push(...diff[i][1]);
                }
                else {
                    for (const line of token[1]) {
                        rows.push(createRow(line, "deletion" /* Deletion */));
                    }
                }
                break;
        }
    }
    return { originalLines, currentLines, rows };
    function createEqualRows(lines, atStart, atEnd) {
        const equalRows = [];
        if (!atStart) {
            for (let i = 0; i < paddingLines && i < lines.length; i++) {
                equalRows.push(createRow(lines[i], "equal" /* Equal */));
            }
            if (lines.length > paddingLines * 2 + 1 && !atEnd) {
                equalRows.push(createRow(i18nString(UIStrings.SkippingDMatchingLines, { PH1: (lines.length - paddingLines * 2) }), "spacer" /* Spacer */));
            }
        }
        if (!atEnd) {
            const start = Math.max(lines.length - paddingLines - 1, atStart ? 0 : paddingLines);
            let skip = lines.length - paddingLines - 1;
            if (!atStart) {
                skip -= paddingLines;
            }
            if (skip > 0) {
                originalLineNumber += skip;
                currentLineNumber += skip;
            }
            for (let i = start; i < lines.length; i++) {
                equalRows.push(createRow(lines[i], "equal" /* Equal */));
            }
        }
        return equalRows;
    }
    function createModifyRows(before, after) {
        const internalDiff = Diff.Diff.DiffWrapper.charDiff(before, after, true /* cleanup diff */);
        const deletionRows = [createRow('', "deletion" /* Deletion */)];
        const insertionRows = [createRow('', "addition" /* Addition */)];
        for (const token of internalDiff) {
            const text = token[1];
            const type = token[0];
            const className = type === Diff.Diff.Operation.Equal ? '' : 'inner-diff';
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (i > 0 && type !== Diff.Diff.Operation.Insert) {
                    deletionRows.push(createRow('', "deletion" /* Deletion */));
                }
                if (i > 0 && type !== Diff.Diff.Operation.Delete) {
                    insertionRows.push(createRow('', "addition" /* Addition */));
                }
                if (!lines[i]) {
                    continue;
                }
                if (type !== Diff.Diff.Operation.Insert) {
                    deletionRows[deletionRows.length - 1].tokens.push({ text: lines[i], className });
                }
                if (type !== Diff.Diff.Operation.Delete) {
                    insertionRows[insertionRows.length - 1].tokens.push({ text: lines[i], className });
                }
            }
        }
        return deletionRows.concat(insertionRows);
    }
    function createRow(text, type) {
        if (type === "addition" /* Addition */) {
            currentLineNumber++;
        }
        if (type === "deletion" /* Deletion */) {
            originalLineNumber++;
        }
        if (type === "equal" /* Equal */) {
            originalLineNumber++;
            currentLineNumber++;
        }
        return { originalLineNumber, currentLineNumber, tokens: text ? [{ text, className: 'inner-diff' }] : [], type };
    }
}
function documentMap(lines) {
    const map = new Map();
    for (let pos = 0, lineNo = 0; lineNo < lines.length; lineNo++) {
        map.set(lineNo + 1, pos);
        pos += lines[lineNo].length + 1;
    }
    return map;
}
class DiffRenderer {
    originalHighlighter;
    originalMap;
    currentHighlighter;
    currentMap;
    constructor(originalHighlighter, originalMap, currentHighlighter, currentMap) {
        this.originalHighlighter = originalHighlighter;
        this.originalMap = originalMap;
        this.currentHighlighter = currentHighlighter;
        this.currentMap = currentMap;
    }
    #render(rows) {
        return LitHtml.html `
      <div class="diff-listing" aria-label=${i18nString(UIStrings.changesDiffViewer)}>
        ${rows.map(row => this.#renderRow(row))}
      </div>`;
    }
    #renderRow(row) {
        const baseNumber = row.type === "equal" /* Equal */ || row.type === "deletion" /* Deletion */ ? String(row.originalLineNumber) : '';
        const curNumber = row.type === "equal" /* Equal */ || row.type === "addition" /* Addition */ ? String(row.currentLineNumber) : '';
        let marker = '', markerClass = 'diff-line-marker', screenReaderText = null;
        if (row.type === "addition" /* Addition */) {
            marker = '+';
            markerClass += ' diff-line-addition';
            screenReaderText = LitHtml.html `<span class="diff-hidden-text">${i18nString(UIStrings.additions)}</span>`;
        }
        else if (row.type === "deletion" /* Deletion */) {
            marker = '-';
            markerClass += ' diff-line-deletion';
            screenReaderText = LitHtml.html `<span class="diff-hidden-text">${i18nString(UIStrings.deletions)}</span>`;
        }
        return LitHtml.html `
      <div class="diff-line-number" aria-hidden="true">${baseNumber}</div>
      <div class="diff-line-number" aria-hidden="true">${curNumber}</div>
      <div class=${markerClass} aria-hidden="true">${marker}</div>
      <div class="diff-line-content diff-line-${row.type}" data-line-number=${curNumber}>${screenReaderText}${this.#renderRowContent(row)}</div>`;
    }
    #renderRowContent(row) {
        if (row.type === "spacer" /* Spacer */) {
            return row.tokens.map(tok => LitHtml.html `${tok.text}`);
        }
        const [doc, startPos] = row.type === "deletion" /* Deletion */ ?
            [this.originalHighlighter, this.originalMap.get(row.originalLineNumber)] :
            [this.currentHighlighter, this.currentMap.get(row.currentLineNumber)];
        const content = [];
        let pos = startPos;
        for (const token of row.tokens) {
            const tokenContent = [];
            doc.highlightRange(pos, pos + token.text.length, (text, style) => {
                tokenContent.push(style ? LitHtml.html `<span class=${style}>${text}</span>` : text);
            });
            content.push(token.className ? LitHtml.html `<span class=${token.className}>${tokenContent}</span>` :
                LitHtml.html `${tokenContent}`);
            pos += token.text.length;
        }
        return content;
    }
    static async render(diff, mimeType, parent) {
        const { originalLines, currentLines, rows } = buildDiffRows(diff);
        const renderer = new DiffRenderer(await CodeHighlighter.CodeHighlighter.create(originalLines.join('\n'), mimeType), documentMap(originalLines), await CodeHighlighter.CodeHighlighter.create(currentLines.join('\n'), mimeType), documentMap(currentLines));
        LitHtml.render(renderer.#render(rows), parent, { host: this });
    }
}
export class DiffView extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-diff-view`;
    #shadow = this.attachShadow({ mode: 'open' });
    loaded;
    constructor(data) {
        super();
        this.#shadow.adoptedStyleSheets = [diffViewStyles, CodeHighlighter.Style.default];
        if (data) {
            this.loaded = DiffRenderer.render(data.diff, data.mimeType, this.#shadow);
        }
        else {
            this.loaded = Promise.resolve();
        }
    }
    set data(data) {
        this.loaded = DiffRenderer.render(data.diff, data.mimeType, this.#shadow);
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-diff-view', DiffView);
//# sourceMappingURL=DiffView.js.map