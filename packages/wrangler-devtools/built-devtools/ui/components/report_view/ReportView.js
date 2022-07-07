// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ComponentHelpers from '../../components/helpers/helpers.js';
import * as LitHtml from '../../lit-html/lit-html.js';
import reportStyles from './report.css.js';
import reportKeyStyles from './reportKey.css.js';
import reportSectionStyles from './reportSection.css.js';
import reportSectionDividerStyles from './reportSectionDivider.css.js';
import reportSectionHeaderStyles from './reportSectionHeader.css.js';
import reportValueStyles from './reportValue.css.js';
export class Report extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-report`;
    #shadow = this.attachShadow({ mode: 'open' });
    #reportTitle = '';
    set data({ reportTitle }) {
        this.#reportTitle = reportTitle;
        this.#render();
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [reportStyles];
        this.#render();
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div class="content">
        ${this.#reportTitle ? LitHtml.html `<div class="report-title">${this.#reportTitle}</div>` : LitHtml.nothing}
        <slot></slot>
      </div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
export class ReportSection extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-report-section`;
    #shadow = this.attachShadow({ mode: 'open' });
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [reportSectionStyles];
        this.#render();
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div class="section">
        <slot></slot>
      </div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
export class ReportSectionHeader extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-report-section-header`;
    #shadow = this.attachShadow({ mode: 'open' });
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [reportSectionHeaderStyles];
        this.#render();
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div class="section-header">
        <slot></slot>
      </div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
export class ReportSectionDivider extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-report-divider`;
    #shadow = this.attachShadow({ mode: 'open' });
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [reportSectionDividerStyles];
        this.#render();
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div class="section-divider">
      </div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
export class ReportKey extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-report-key`;
    #shadow = this.attachShadow({ mode: 'open' });
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [reportKeyStyles];
        this.#render();
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div class="key"><slot></slot></div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
export class ReportValue extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-report-value`;
    #shadow = this.attachShadow({ mode: 'open' });
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [reportValueStyles];
        this.#render();
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div class="value"><slot></slot></div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-report', Report);
ComponentHelpers.CustomElements.defineComponent('devtools-report-section', ReportSection);
ComponentHelpers.CustomElements.defineComponent('devtools-report-section-header', ReportSectionHeader);
ComponentHelpers.CustomElements.defineComponent('devtools-report-key', ReportKey);
ComponentHelpers.CustomElements.defineComponent('devtools-report-value', ReportValue);
ComponentHelpers.CustomElements.defineComponent('devtools-report-divider', ReportSectionDivider);
//# sourceMappingURL=ReportView.js.map