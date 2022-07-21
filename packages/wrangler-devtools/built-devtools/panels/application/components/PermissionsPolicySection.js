// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import * as NetworkForward from '../../../panels/network/forward/forward.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as IconButton from '../../../ui/components/icon_button/icon_button.js';
import * as Coordinator from '../../../ui/components/render_coordinator/render_coordinator.js';
import * as ReportView from '../../../ui/components/report_view/report_view.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import permissionsPolicySectionStyles from './permissionsPolicySection.css.js';
import * as Common from '../../../core/common/common.js';
const UIStrings = {
    /**
    *@description Label for a button. When clicked more details (for the content this button refers to) will be shown.
    */
    showDetails: 'Show details',
    /**
    *@description Label for a button. When clicked some details (for the content this button refers to) will be hidden.
    */
    hideDetails: 'Hide details',
    /**
    *@description Label for a list of features which are allowed according to the current Permissions policy
    *(a mechanism that allows developers to enable/disable browser features and APIs (e.g. camera, geolocation, autoplay))
    */
    allowedFeatures: 'Allowed Features',
    /**
    *@description Label for a list of features which are disabled according to the current Permissions policy
    *(a mechanism that allows developers to enable/disable browser features and APIs (e.g. camera, geolocation, autoplay))
    */
    disabledFeatures: 'Disabled Features',
    /**
    *@description Tooltip text for a link to a specific request's headers in the Network panel.
    */
    clickToShowHeader: 'Click to reveal the request whose "`Permissions-Policy`" HTTP header disables this feature.',
    /**
    *@description Tooltip text for a link to a specific iframe in the Elements panel (Iframes can be nested, the link goes
    *  to the outer-most iframe which blocks a certain feature).
    */
    clickToShowIframe: 'Click to reveal the top-most iframe which does not allow this feature in the elements panel.',
    /**
    *@description Text describing that a specific feature is blocked by not being included in the iframe's "allow" attribute.
    */
    disabledByIframe: 'missing in iframe "`allow`" attribute',
    /**
    *@description Text describing that a specific feature is blocked by a Permissions Policy specified in a request header.
    */
    disabledByHeader: 'disabled by "`Permissions-Policy`" header',
    /**
     *@description Text describing that a specific feature is blocked by virtue of being inside a fenced frame tree.
     */
    disabledByFencedFrame: 'disabled inside a `fencedframe`',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/components/PermissionsPolicySection.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const coordinator = Coordinator.RenderCoordinator.RenderCoordinator.instance();
export function renderIconLink(iconName, title, clickHandler) {
    // Disabled until https://crbug.com/1079231 is fixed.
    // clang-format off
    return LitHtml.html `
    <button class="link" role="link" tabindex=0 @click=${clickHandler} title=${title}>
      <${IconButton.Icon.Icon.litTagName} .data=${{
        iconName: iconName,
        color: 'var(--color-primary)',
        width: '16px',
        height: '16px',
    }}>
      </${IconButton.Icon.Icon.litTagName}>
    </button>
  `;
    // clang-format on
}
export class PermissionsPolicySection extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-resources-permissions-policy-section`;
    #shadow = this.attachShadow({ mode: 'open' });
    #permissionsPolicySectionData = { policies: [], showDetails: false };
    set data(data) {
        this.#permissionsPolicySectionData = data;
        void this.#render();
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [permissionsPolicySectionStyles];
    }
    #toggleShowPermissionsDisallowedDetails() {
        this.#permissionsPolicySectionData.showDetails = !this.#permissionsPolicySectionData.showDetails;
        void this.#render();
    }
    #renderAllowed() {
        const allowed = this.#permissionsPolicySectionData.policies.filter(p => p.allowed).map(p => p.feature).sort();
        if (!allowed.length) {
            return LitHtml.nothing;
        }
        return LitHtml.html `
      <${ReportView.ReportView.ReportKey.litTagName}>${i18nString(UIStrings.allowedFeatures)}</${ReportView.ReportView.ReportKey.litTagName}>
      <${ReportView.ReportView.ReportValue.litTagName}>
        ${allowed.join(', ')}
      </${ReportView.ReportView.ReportValue.litTagName}>
    `;
    }
    async #renderDisallowed() {
        const disallowed = this.#permissionsPolicySectionData.policies.filter(p => !p.allowed)
            .sort((a, b) => a.feature.localeCompare(b.feature));
        if (!disallowed.length) {
            return LitHtml.nothing;
        }
        if (!this.#permissionsPolicySectionData.showDetails) {
            return LitHtml.html `
        <${ReportView.ReportView.ReportKey.litTagName}>${i18nString(UIStrings.disabledFeatures)}</${ReportView.ReportView.ReportKey.litTagName}>
        <${ReportView.ReportView.ReportValue.litTagName}>
          ${disallowed.map(p => p.feature).join(', ')}
          <button class="link" @click=${() => this.#toggleShowPermissionsDisallowedDetails()}>
            ${i18nString(UIStrings.showDetails)}
          </button>
        </${ReportView.ReportView.ReportValue.litTagName}>
      `;
        }
        const frameManager = SDK.FrameManager.FrameManager.instance();
        const featureRows = await Promise.all(disallowed.map(async (policy) => {
            const frame = policy.locator ? frameManager.getFrame(policy.locator.frameId) : null;
            const blockReason = policy.locator?.blockReason;
            const linkTargetDOMNode = await (blockReason === "IframeAttribute" /* IframeAttribute */ && frame &&
                frame.getOwnerDOMNodeOrDocument());
            const resource = frame && frame.resourceForURL(frame.url);
            const linkTargetRequest = blockReason === "Header" /* Header */ && resource && resource.request;
            const blockReasonText = (() => {
                switch (blockReason) {
                    case "IframeAttribute" /* IframeAttribute */:
                        return i18nString(UIStrings.disabledByIframe);
                    case "Header" /* Header */:
                        return i18nString(UIStrings.disabledByHeader);
                    case "InFencedFrameTree" /* InFencedFrameTree */:
                        return i18nString(UIStrings.disabledByFencedFrame);
                    default:
                        return '';
                }
            })();
            const revealHeader = async () => {
                if (!linkTargetRequest) {
                    return;
                }
                const headerName = linkTargetRequest.responseHeaderValue('permissions-policy') ? 'permissions-policy' : 'feature-policy';
                const requestLocation = NetworkForward.UIRequestLocation.UIRequestLocation.responseHeaderMatch(linkTargetRequest, { name: headerName, value: '' });
                await Common.Revealer.reveal(requestLocation);
            };
            return LitHtml.html `
        <div class="permissions-row">
          <div>
            <${IconButton.Icon.Icon.litTagName} class="allowed-icon"
              .data=${{ color: '', iconName: 'error_icon', width: '14px' }}>
            </${IconButton.Icon.Icon.litTagName}>
          </div>
          <div class="feature-name text-ellipsis">
            ${policy.feature}
          </div>
          <div class="block-reason">${blockReasonText}</div>
          <div>
            ${linkTargetDOMNode ? renderIconLink('elements_panel_icon', i18nString(UIStrings.clickToShowIframe), () => Common.Revealer.reveal(linkTargetDOMNode)) :
                LitHtml.nothing}
            ${linkTargetRequest ? renderIconLink('network_panel_icon', i18nString(UIStrings.clickToShowHeader), revealHeader) :
                LitHtml.nothing}
          </div>
        </div>
      `;
        }));
        return LitHtml.html `
      <${ReportView.ReportView.ReportKey.litTagName}>${i18nString(UIStrings.disabledFeatures)}</${ReportView.ReportView.ReportKey.litTagName}>
      <${ReportView.ReportView.ReportValue.litTagName} class="policies-list">
        ${featureRows}
        <div class="permissions-row">
          <button class="link" @click=${() => this.#toggleShowPermissionsDisallowedDetails()}>
            ${i18nString(UIStrings.hideDetails)}
          </button>
        </div>
      </${ReportView.ReportView.ReportValue.litTagName}>
    `;
    }
    async #render() {
        await coordinator.write('PermissionsPolicySection render', () => {
            // Disabled until https://crbug.com/1079231 is fixed.
            // clang-format off
            LitHtml.render(LitHtml.html `
          <${ReportView.ReportView.ReportSectionHeader.litTagName}>${i18n.i18n.lockedString('Permissions Policy')}</${ReportView.ReportView.ReportSectionHeader.litTagName}>
          ${this.#renderAllowed()}
          ${LitHtml.Directives.until(this.#renderDisallowed(), LitHtml.nothing)}
          <${ReportView.ReportView.ReportSectionDivider.litTagName}></${ReportView.ReportView.ReportSectionDivider.litTagName}>
        `, this.#shadow, { host: this });
            // clang-format on
        });
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-resources-permissions-policy-section', PermissionsPolicySection);
//# sourceMappingURL=PermissionsPolicySection.js.map