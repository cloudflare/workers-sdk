// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as Platform from '../../core/platform/platform.js';
import * as ComponentHelpers from '../components/helpers/helpers.js';
import * as LitHtml from '../lit-html/lit-html.js';
import * as ARIAUtils from './ARIAUtils.js';
import { html } from './Fragment.js';
import { Tooltip } from './Tooltip.js';
import { addReferrerToURLIfNecessary, copyLinkAddressLabel, MaxLengthForDisplayedURLs, openLinkExternallyLabel, } from './UIUtils.js';
import { XElement } from './XElement.js';
export class XLink extends XElement {
    hrefInternal;
    clickable;
    onClick;
    onKeyDown;
    static create(url, linkText, className, preventClick) {
        if (!linkText) {
            linkText = url;
        }
        className = className || '';
        // clang-format off
        // TODO(dgozman): migrate css from 'devtools-link' to 'x-link'.
        const element = html `
  <x-link href='${url}' tabindex="0" class='${className} devtools-link' ${preventClick ? 'no-click' : ''}
  >${Platform.StringUtilities.trimMiddle(linkText, MaxLengthForDisplayedURLs)}</x-link>`;
        // clang-format on
        return element;
    }
    constructor() {
        super();
        this.style.setProperty('display', 'inline');
        ARIAUtils.markAsLink(this);
        this.setAttribute('tabindex', '0');
        this.setAttribute('target', '_blank');
        this.setAttribute('rel', 'noopener');
        this.hrefInternal = null;
        this.clickable = true;
        this.onClick = (event) => {
            event.consume(true);
            if (this.hrefInternal) {
                Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(this.hrefInternal);
            }
            this.dispatchEvent(new Event('x-link-invoke'));
        };
        this.onKeyDown = (event) => {
            if (isEnterOrSpaceKey(event)) {
                event.consume(true);
                if (this.hrefInternal) {
                    Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(this.hrefInternal);
                }
            }
            this.dispatchEvent(new Event('x-link-invoke'));
        };
    }
    static get observedAttributes() {
        // TODO(dgozman): should be super.observedAttributes, but it does not compile.
        return XElement.observedAttributes.concat(['href', 'no-click']);
    }
    get href() {
        return this.hrefInternal;
    }
    attributeChangedCallback(attr, oldValue, newValue) {
        if (attr === 'no-click') {
            this.clickable = !newValue;
            this.updateClick();
            return;
        }
        if (attr === 'href') {
            // For invalid or non-absolute URLs, `href` should remain `null`.
            if (!newValue) {
                newValue = '';
            }
            let href = null;
            let url = null;
            try {
                url = new URL(addReferrerToURLIfNecessary(newValue));
                href = url.toString();
            }
            catch {
            }
            if (url && url.protocol === 'javascript:') {
                href = null;
            }
            this.hrefInternal = href;
            Tooltip.install(this, newValue);
            this.updateClick();
            return;
        }
        super.attributeChangedCallback(attr, oldValue, newValue);
    }
    updateClick() {
        if (this.hrefInternal !== null && this.clickable) {
            this.addEventListener('click', this.onClick, false);
            this.addEventListener('keydown', this.onKeyDown, false);
            this.style.setProperty('cursor', 'pointer');
        }
        else {
            this.removeEventListener('click', this.onClick, false);
            this.removeEventListener('keydown', this.onKeyDown, false);
            this.style.removeProperty('cursor');
        }
    }
}
let contextMenuProviderInstance;
export class ContextMenuProvider {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!contextMenuProviderInstance || forceNew) {
            contextMenuProviderInstance = new ContextMenuProvider();
        }
        return contextMenuProviderInstance;
    }
    appendApplicableItems(event, contextMenu, target) {
        let targetNode = target;
        while (targetNode && !(targetNode instanceof XLink)) {
            targetNode = targetNode.parentNodeOrShadowHost();
        }
        if (!targetNode || !targetNode.href) {
            return;
        }
        const node = targetNode;
        contextMenu.revealSection().appendItem(openLinkExternallyLabel(), () => {
            if (node.href) {
                Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(node.href);
            }
        });
        contextMenu.revealSection().appendItem(copyLinkAddressLabel(), () => {
            if (node.href) {
                Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(node.href);
            }
        });
    }
}
ComponentHelpers.CustomElements.defineComponent('x-link', XLink);
export const sample = LitHtml.html `<p>Hello, <x-link>world!</x-link></p>`;
//# sourceMappingURL=XLink.js.map