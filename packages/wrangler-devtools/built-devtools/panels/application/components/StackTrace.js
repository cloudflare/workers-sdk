// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as ExpandableList from '../../../ui/components/expandable_list/expandable_list.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as Components from '../../../ui/legacy/components/utils/utils.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import stackTraceRowStyles from './stackTraceRow.css.js';
import stackTraceLinkButtonStyles from './stackTraceLinkButton.css.js';
const UIStrings = {
    /**
    *@description Error message stating that something went wrong when tring to render stack trace
    */
    cannotRenderStackTrace: 'Cannot render stack trace',
    /**
    *@description A link to show more frames in the stack trace if more are available. Never 0.
    */
    showSMoreFrames: '{n, plural, =1 {Show # more frame} other {Show # more frames}}',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/components/StackTrace.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class StackTraceRow extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-stack-trace-row`;
    #shadow = this.attachShadow({ mode: 'open' });
    #stackTraceRowItem = null;
    set data(data) {
        this.#stackTraceRowItem = data.stackTraceRowItem;
        this.#render();
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [stackTraceRowStyles];
    }
    #render() {
        if (!this.#stackTraceRowItem) {
            return;
        }
        LitHtml.render(LitHtml.html `
      <div class="stack-trace-row">
              <div class="stack-trace-function-name text-ellipsis" title=${this.#stackTraceRowItem.functionName}>
                ${this.#stackTraceRowItem.functionName}
              </div>
              <div class="stack-trace-source-location">
                ${this.#stackTraceRowItem.link ?
            LitHtml.html `<div class="text-ellipsis">\xA0@\xA0${this.#stackTraceRowItem.link}</div>` :
            LitHtml.nothing}
              </div>
            </div>
    `, this.#shadow, { host: this });
    }
}
export class StackTraceLinkButton extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-stack-trace-link-button`;
    #shadow = this.attachShadow({ mode: 'open' });
    #onShowAllClick = () => { };
    #hiddenCallFramesCount = null;
    set data(data) {
        this.#onShowAllClick = data.onShowAllClick;
        this.#hiddenCallFramesCount = data.hiddenCallFramesCount;
        this.#render();
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [stackTraceLinkButtonStyles];
    }
    #render() {
        if (!this.#hiddenCallFramesCount) {
            return;
        }
        LitHtml.render(LitHtml.html `
      <div class="stack-trace-row">
          <button class="link" @click=${() => this.#onShowAllClick()}>
            ${i18nString(UIStrings.showSMoreFrames, {
            n: this.#hiddenCallFramesCount,
        })}
          </button>
        </div>
    `, this.#shadow, { host: this });
    }
}
export class StackTrace extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-resources-stack-trace`;
    #shadow = this.attachShadow({ mode: 'open' });
    #linkifier = new Components.Linkifier.Linkifier();
    #stackTraceRows = [];
    #showHidden = false;
    set data(data) {
        const frame = data.frame;
        const { creationStackTrace, creationStackTraceTarget } = frame.getCreationStackTraceData();
        if (creationStackTrace) {
            this.#stackTraceRows = data.buildStackTraceRows(creationStackTrace, creationStackTraceTarget, this.#linkifier, true, this.#onStackTraceRowsUpdated.bind(this));
        }
        this.#render();
    }
    #onStackTraceRowsUpdated(stackTraceRows) {
        this.#stackTraceRows = stackTraceRows;
        this.#render();
    }
    #onShowAllClick() {
        this.#showHidden = true;
        this.#render();
    }
    createRowTemplates() {
        const expandableRows = [];
        let hiddenCallFramesCount = 0;
        for (const item of this.#stackTraceRows) {
            if (this.#showHidden || (!item.ignoreListHide && !item.rowCountHide)) {
                if ('functionName' in item) {
                    expandableRows.push(LitHtml.html `
          <${StackTraceRow.litTagName} data-stack-trace-row .data=${{
                        stackTraceRowItem: item,
                    }}></${StackTraceRow.litTagName}>`);
                }
                if ('asyncDescription' in item) {
                    expandableRows.push(LitHtml.html `
            <div>${item.asyncDescription}</div>
          `);
                }
            }
            if (!this.#showHidden && 'functionName' in item && (item.ignoreListHide || item.rowCountHide)) {
                hiddenCallFramesCount++;
            }
        }
        if (hiddenCallFramesCount) {
            // Disabled until https://crbug.com/1079231 is fixed.
            // clang-format off
            expandableRows.push(LitHtml.html `
      <${StackTraceLinkButton.litTagName} data-stack-trace-row .data=${{ onShowAllClick: this.#onShowAllClick.bind(this), hiddenCallFramesCount: hiddenCallFramesCount }}></${StackTraceLinkButton.litTagName}>
      `);
            // clang-format on
        }
        return expandableRows;
    }
    #render() {
        if (!this.#stackTraceRows.length) {
            // Disabled until https://crbug.com/1079231 is fixed.
            // clang-format off
            LitHtml.render(LitHtml.html `
          <span>${i18nString(UIStrings.cannotRenderStackTrace)}</span>
        `, this.#shadow, { host: this });
            return;
        }
        const expandableRows = this.createRowTemplates();
        LitHtml.render(LitHtml.html `
        <${ExpandableList.ExpandableList.ExpandableList.litTagName} .data=${{
            rows: expandableRows,
        }}>
        </${ExpandableList.ExpandableList.ExpandableList.litTagName}>
      `, this.#shadow, { host: this });
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-stack-trace-row', StackTraceRow);
ComponentHelpers.CustomElements.defineComponent('devtools-stack-trace-link-button', StackTraceLinkButton);
ComponentHelpers.CustomElements.defineComponent('devtools-resources-stack-trace', StackTrace);
//# sourceMappingURL=StackTrace.js.map