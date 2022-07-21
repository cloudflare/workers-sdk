// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Persistence from '../../../models/persistence/persistence.js';
import * as Workspace from '../../../models/workspace/workspace.js';
import * as Buttons from '../../../ui/components/buttons/buttons.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as UI from '../../../ui/legacy/legacy.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import HeadersViewStyles from './HeadersView.css.js';
const UIStrings = {
    /**
    *@description The title of a button that adds a field to input a header in the editor form.
    */
    addHeader: 'Add a header',
    /**
    *@description The title of a button that removes a field to input a header in the editor form.
    */
    removeHeader: 'Remove this header',
    /**
    *@description The title of a button that removes a section for defining header overrides in the editor form.
    */
    removeBlock: 'Remove this \'`ApplyTo`\'-section',
    /**
    *@description Error message for files which cannot not be parsed.
    *@example {.headers} PH1
    */
    errorWhenParsing: 'Error when parsing \'\'{PH1}\'\'.',
    /**
    *@description Explainer for files which cannot be parsed.
    *@example {.headers} PH1
    */
    parsingErrorExplainer: 'This is most likely due to a syntax error in \'\'{PH1}\'\'. Try opening this file in an external editor to fix the error or delete the file and re-create the override.',
    /**
    *@description Button text for a button which adds an additional header override.
    */
    addHeaderOverride: 'Add header override',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/components/HeadersView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const plusIconUrl = new URL('../../../Images/plus_icon.svg', import.meta.url).toString();
const minusIconUrl = new URL('../../../Images/minus_icon.svg', import.meta.url).toString();
export class HeadersView extends UI.View.SimpleView {
    #headersViewComponent = new HeadersViewComponent();
    #uiSourceCode;
    constructor(uiSourceCode) {
        super(i18n.i18n.lockedString('HeadersView'));
        this.#uiSourceCode = uiSourceCode;
        this.#uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.#onWorkingCopyChanged, this);
        this.#uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.#onWorkingCopyCommitted, this);
        this.element.appendChild(this.#headersViewComponent);
        void this.#setInitialData();
    }
    async #setInitialData() {
        const content = await this.#uiSourceCode.requestContent();
        this.#setComponentData(content.content || '');
    }
    #setComponentData(content) {
        let parsingError = false;
        let headerOverrides = [];
        content = content || '[]';
        try {
            headerOverrides = JSON.parse(content);
            if (!headerOverrides.every(Persistence.NetworkPersistenceManager.isHeaderOverride)) {
                throw 'Type mismatch after parsing';
            }
        }
        catch (e) {
            console.error('Failed to parse', this.#uiSourceCode.url(), 'for locally overriding headers.');
            parsingError = true;
        }
        // Header overrides are stored as the key-value pairs of a JSON object on
        // disk. For the editor we want them as an array instead, so that we can
        // access/add/remove entries by their index.
        const arrayOfHeaderOverrideArrays = headerOverrides.map(headerOverride => {
            return {
                applyTo: headerOverride.applyTo,
                headers: Object.entries(headerOverride.headers).map(([headerName, headerValue]) => {
                    return {
                        name: headerName,
                        value: headerValue,
                    };
                }),
            };
        });
        this.#headersViewComponent.data = {
            headerOverrides: arrayOfHeaderOverrideArrays,
            uiSourceCode: this.#uiSourceCode,
            parsingError,
        };
    }
    commitEditing() {
        this.#uiSourceCode.commitWorkingCopy();
        Persistence.NetworkPersistenceManager.NetworkPersistenceManager.instance().updateInterceptionPatterns();
    }
    #onWorkingCopyChanged() {
        this.#setComponentData(this.#uiSourceCode.workingCopy());
    }
    #onWorkingCopyCommitted() {
        this.#setComponentData(this.#uiSourceCode.workingCopy());
    }
    getComponent() {
        return this.#headersViewComponent;
    }
    dispose() {
        this.#uiSourceCode.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.#onWorkingCopyChanged, this);
        this.#uiSourceCode.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.#onWorkingCopyCommitted, this);
    }
}
export class HeadersViewComponent extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-sources-headers-view`;
    #shadow = this.attachShadow({ mode: 'open' });
    #boundRender = this.#render.bind(this);
    #headerOverrides = [];
    #uiSourceCode = null;
    #parsingError = false;
    #focusElement = null;
    constructor() {
        super();
        this.#shadow.addEventListener('focusin', this.#onFocusIn.bind(this));
        this.#shadow.addEventListener('focusout', this.#onFocusOut.bind(this));
        this.#shadow.addEventListener('click', this.#onClick.bind(this));
        this.#shadow.addEventListener('input', this.#onInput.bind(this));
        this.#shadow.addEventListener('keydown', this.#onKeyDown.bind(this));
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [HeadersViewStyles];
    }
    set data(data) {
        this.#headerOverrides = data.headerOverrides;
        this.#uiSourceCode = data.uiSourceCode;
        this.#parsingError = data.parsingError;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    // 'Enter' key should not create a new line in the contenteditable. Focus
    // on the next contenteditable instead.
    #onKeyDown(event) {
        const keyboardEvent = event;
        const target = event.target;
        if (target.matches('.editable') && keyboardEvent.key === 'Enter') {
            event.preventDefault();
            this.#focusNext(target);
        }
    }
    #focusNext(target) {
        const elements = Array.from(this.#shadow.querySelectorAll('.editable'));
        const idx = elements.indexOf(target);
        if (idx !== -1 && idx + 1 < elements.length) {
            elements[idx + 1].focus();
        }
    }
    #selectAllText(target) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection?.removeAllRanges();
        selection?.addRange(range);
    }
    #onFocusIn(e) {
        const target = e.target;
        if (target.matches('.editable')) {
            this.#selectAllText(target);
        }
    }
    #onFocusOut() {
        // clear selection
        const selection = window.getSelection();
        selection?.removeAllRanges();
    }
    #generateNextHeaderName(headers) {
        const takenNames = new Set(headers.map(header => header.name));
        let idx = 1;
        while (takenNames.has('headerName' + idx)) {
            idx++;
        }
        return 'headerName' + idx;
    }
    #onClick(e) {
        const target = e.target;
        const rowElement = target.closest('.row');
        const blockIndex = Number(rowElement?.dataset.blockIndex || 0);
        const headerIndex = Number(rowElement?.dataset.headerIndex || 0);
        if (target.matches('.add-header')) {
            this.#headerOverrides[blockIndex].headers.splice(headerIndex + 1, 0, { name: this.#generateNextHeaderName(this.#headerOverrides[blockIndex].headers), value: 'headerValue' });
            this.#focusElement = { blockIndex, headerIndex: headerIndex + 1 };
            this.#onHeadersChanged();
        }
        else if (target.matches('.remove-header')) {
            this.#headerOverrides[blockIndex].headers.splice(headerIndex, 1);
            if (this.#headerOverrides[blockIndex].headers.length === 0) {
                this.#headerOverrides[blockIndex].headers.push({ name: this.#generateNextHeaderName(this.#headerOverrides[blockIndex].headers), value: 'headerValue' });
            }
            this.#onHeadersChanged();
        }
        else if (target.matches('.add-block')) {
            this.#headerOverrides.push({ applyTo: '*', headers: [{ name: 'headerName', value: 'headerValue' }] });
            this.#focusElement = { blockIndex: this.#headerOverrides.length - 1 };
            this.#onHeadersChanged();
        }
        else if (target.matches('.remove-block')) {
            this.#headerOverrides.splice(blockIndex, 1);
            this.#onHeadersChanged();
        }
    }
    #onInput(e) {
        const target = e.target;
        const rowElement = target.closest('.row');
        const blockIndex = Number(rowElement.dataset.blockIndex);
        const headerIndex = Number(rowElement.dataset.headerIndex);
        if (target.matches('.header-name')) {
            this.#headerOverrides[blockIndex].headers[headerIndex].name = target.innerText;
            this.#onHeadersChanged();
        }
        if (target.matches('.header-value')) {
            this.#headerOverrides[blockIndex].headers[headerIndex].value = target.innerText;
            this.#onHeadersChanged();
        }
        if (target.matches('.apply-to')) {
            this.#headerOverrides[blockIndex].applyTo = target.innerText;
            this.#onHeadersChanged();
        }
    }
    #onHeadersChanged() {
        // In the editor header overrides are represented by items in an array, so
        // that we can access/add/remove entries by their index. On disk, they are
        // stored as key-value pairs of a JSON object instead.
        const arrayOfHeaderOverrideObjects = this.#headerOverrides.map(headerOverride => {
            return {
                applyTo: headerOverride.applyTo,
                headers: headerOverride.headers.reduce((a, v) => ({ ...a, [v.name]: v.value }), {}),
            };
        });
        this.#uiSourceCode?.setWorkingCopy(JSON.stringify(arrayOfHeaderOverrideObjects, null, 2));
    }
    #render() {
        if (!ComponentHelpers.ScheduledRender.isScheduledRender(this)) {
            throw new Error('HeadersView render was not scheduled');
        }
        if (this.#parsingError) {
            const fileName = this.#uiSourceCode?.name() || '.headers';
            // clang-format off
            LitHtml.render(LitHtml.html `
        <div class="center-wrapper">
          <div class="centered">
            <div class="error-header">${i18nString(UIStrings.errorWhenParsing, { PH1: fileName })}</div>
            <div class="error-body">${i18nString(UIStrings.parsingErrorExplainer, { PH1: fileName })}</div>
          </div>
        </div>
      `, this.#shadow, { host: this });
            // clang-format on
            return;
        }
        // clang-format off
        LitHtml.render(LitHtml.html `
      ${this.#headerOverrides.map((headerOverride, blockIndex) => LitHtml.html `
          ${this.#renderApplyToRow(headerOverride.applyTo, blockIndex)}
          ${headerOverride.headers.map((header, headerIndex) => LitHtml.html `
              ${this.#renderHeaderRow(header, blockIndex, headerIndex)}
            `)}
        `)}
      <${Buttons.Button.Button.litTagName} .variant=${"secondary" /* SECONDARY */} class="add-block">
        ${i18nString(UIStrings.addHeaderOverride)}
      </${Buttons.Button.Button.litTagName}>
    `, this.#shadow, { host: this });
        // clang-format on
        if (this.#focusElement) {
            let focusElement = null;
            if (this.#focusElement.headerIndex) {
                focusElement = this.#shadow.querySelector(`[data-block-index="${this.#focusElement.blockIndex}"][data-header-index="${this.#focusElement.headerIndex}"] .header-name`);
            }
            else {
                focusElement = this.#shadow.querySelector(`[data-block-index="${this.#focusElement.blockIndex}"] .apply-to`);
            }
            if (focusElement) {
                focusElement.focus();
            }
            this.#focusElement = null;
        }
    }
    #renderApplyToRow(pattern, blockIndex) {
        // clang-format off
        return LitHtml.html `
      <div class="row" data-block-index=${blockIndex}>
        <div>${i18n.i18n.lockedString('Apply to')}</div>
        <div class="separator">:</div>
        ${this.#renderEditable(pattern, 'apply-to')}
        <${Buttons.Button.Button.litTagName}
        title=${i18nString(UIStrings.removeBlock)}
        .size=${"SMALL" /* SMALL */}
        .iconUrl=${minusIconUrl}
        .variant=${"round" /* ROUND */}
        class="remove-block inline-button"
      ></${Buttons.Button.Button.litTagName}>
      </div>
    `;
        // clang-format on
    }
    #renderHeaderRow(header, blockIndex, headerIndex) {
        // clang-format off
        return LitHtml.html `
      <div class="row padded" data-block-index=${blockIndex} data-header-index=${headerIndex}>
        ${this.#renderEditable(header.name, 'header-name red')}
        <div class="separator">:</div>
        ${this.#renderEditable(header.value, 'header-value')}
        <${Buttons.Button.Button.litTagName}
          title=${i18nString(UIStrings.addHeader)}
          .size=${"SMALL" /* SMALL */}
          .iconUrl=${plusIconUrl}
          .variant=${"round" /* ROUND */}
          class="add-header inline-button"
        ></${Buttons.Button.Button.litTagName}>
        <${Buttons.Button.Button.litTagName}
          title=${i18nString(UIStrings.removeHeader)}
          .size=${"SMALL" /* SMALL */}
          .iconUrl=${minusIconUrl}
          .variant=${"round" /* ROUND */}
          class="remove-header inline-button"
        ></${Buttons.Button.Button.litTagName}>
      </div>
    `;
        // clang-format on
    }
    #renderEditable(value, className) {
        // This uses LitHtml's `live`-directive, so that when checking whether to
        // update during re-render, `value` is compared against the actual live DOM
        // value of the contenteditable element and not the potentially outdated
        // value from the previous render.
        // clang-format off
        return LitHtml.html `<span contenteditable="true" class="editable ${className}" tabindex="0" .innerText=${LitHtml.Directives.live(value)}></span>`;
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-sources-headers-view', HeadersViewComponent);
//# sourceMappingURL=HeadersView.js.map