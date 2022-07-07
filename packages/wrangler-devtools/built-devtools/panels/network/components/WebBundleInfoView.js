// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as UI from '../../../ui/legacy/legacy.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as IconButton from '../../../ui/components/icon_button/icon_button.js';
import * as DataGrid from '../../../ui/components/data_grid/data_grid.js';
import { imageNameForResourceType } from '../../../panels/utils/utils.js';
import webBundleInfoViewStyles from './WebBundleInfoView.css.js';
const { render, html } = LitHtml;
const UIStrings = {
    /**
    *@description Header for the column that contains URL of the resource in a web bundle.
    */
    bundledResource: 'Bundled resource',
};
const str_ = i18n.i18n.registerUIStrings('panels/network/components/WebBundleInfoView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class WebBundleInfoView extends UI.Widget.VBox {
    constructor(request) {
        super();
        const webBundleInfo = request.webBundleInfo();
        if (!webBundleInfo) {
            throw new Error('Trying to render a Web Bundle info without providing data');
        }
        const webBundleInfoElement = new WebBundleInfoElement(webBundleInfo, request.parsedURL.lastPathComponent);
        this.contentElement.appendChild(webBundleInfoElement);
        webBundleInfoElement.render();
    }
}
export class WebBundleInfoElement extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-web-bundle-info`;
    #shadow = this.attachShadow({ mode: 'open' });
    #webBundleInfo;
    #webBundleName;
    constructor(webBundleInfo, webBundleName) {
        super();
        this.#webBundleInfo = webBundleInfo;
        this.#webBundleName = webBundleName;
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [webBundleInfoViewStyles];
    }
    render() {
        const rows = this.#webBundleInfo.resourceUrls?.map(url => {
            const mimeType = Common.ResourceType.ResourceType.mimeFromURL(url) || null;
            const resourceType = Common.ResourceType.ResourceType.fromMimeTypeOverride(mimeType) ||
                Common.ResourceType.ResourceType.fromMimeType(mimeType);
            const iconName = imageNameForResourceType(resourceType);
            return {
                cells: [
                    {
                        columnId: 'url',
                        value: null,
                        renderer() {
                            return html `
                <div style="display: flex;">
                  <${IconButton.Icon.Icon.litTagName} class="icon"
                    .data=${{ color: '', iconName, width: '18px' }}>
                  </${IconButton.Icon.Icon.litTagName}>
                  <span>${url}</span>
                </div>`;
                        },
                    },
                ],
            };
        });
        render(html `
      <div class="header">
        <${IconButton.Icon.Icon.litTagName} class="icon"
          .data=${{ color: '', iconName: 'resourceWebBundle', width: '16px' }}>
        </${IconButton.Icon.Icon.litTagName}>
        <span>${this.#webBundleName}</span>
        <x-link href="https://web.dev/web-bundles/#explaining-web-bundles">
          <${IconButton.Icon.Icon.litTagName} class="icon"
            .data=${{ color: 'var(--color-text-secondary)', iconName: 'help_outline', width: '16px' }}>
          </${IconButton.Icon.Icon.litTagName}>
        </x-link>
      </div>
      <div>
        <${DataGrid.DataGrid.DataGrid.litTagName}
          .data=${{
            columns: [
                {
                    id: 'url',
                    title: i18nString(UIStrings.bundledResource),
                    widthWeighting: 1,
                    visible: true,
                    hideable: false,
                },
            ],
            rows: rows,
            activeSort: null,
        }}>
        </${DataGrid.DataGrid.DataGrid.litTagName}>
      </div>`, this.#shadow, { host: this });
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-web-bundle-info', WebBundleInfoElement);
//# sourceMappingURL=WebBundleInfoView.js.map