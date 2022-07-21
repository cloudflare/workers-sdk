// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as ComponentHelpers from '../../components/helpers/helpers.js';
import * as LitHtml from '../../lit-html/lit-html.js';
import * as IconButton from '../icon_button/icon_button.js';
import panelFeedbackStyles from './panelFeedback.css.js';
const UIStrings = {
    /**
    *@description Introduction sentence to convey the feature is being actively worked on and we are looking for feedback.
    */
    previewText: 'Our team is actively working on this feature and we would love to know what you think.',
    /**
    *@description Link text the user can click to provide feedback to the team.
    */
    previewTextFeedbackLink: 'Send us your feedback.',
    /**
    *@description Title of the UI section that shows the user that this feature is in preview. Used as the main heading. Not a verb.
    */
    previewFeature: 'Preview feature',
    /**
    *@description Title of the section to the quick start video and documentation on experimental panels.
    */
    videoAndDocumentation: 'Video and documentation',
};
const str_ = i18n.i18n.registerUIStrings('ui/components/panel_feedback/PanelFeedback.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const previewFeatureUrl = new URL('../../../Images/ic_preview_feature.svg', import.meta.url).toString();
const videoThumbnailUrl = new URL('../../../Images/preview_feature_video_thumbnail.svg', import.meta.url).toString();
export class PanelFeedback extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-panel-feedback`;
    #shadow = this.attachShadow({ mode: 'open' });
    #boundRender = this.#render.bind(this);
    #props = {
        feedbackUrl: Platform.DevToolsPath.EmptyUrlString,
        quickStartUrl: Platform.DevToolsPath.EmptyUrlString,
        quickStartLinkText: '',
    };
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [panelFeedbackStyles];
    }
    set data(data) {
        this.#props = data;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    #render() {
        if (!ComponentHelpers.ScheduledRender.isScheduledRender(this)) {
            throw new Error('PanelFeedback render was not scheduled');
        }
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div class="preview">
        <h2 class="flex">
          <${IconButton.Icon.Icon.litTagName} .data=${{
            iconPath: previewFeatureUrl,
            width: '24px',
            height: '24px',
            color: 'var(--color-primary)',
        }}></${IconButton.Icon.Icon.litTagName}> ${i18nString(UIStrings.previewFeature)}
        </h2>
        <p>${i18nString(UIStrings.previewText)} <x-link href=${this.#props.feedbackUrl}>${i18nString(UIStrings.previewTextFeedbackLink)}</x-link></p>
        <div class="video">
          <div class="thumbnail">
            <img src=${videoThumbnailUrl} role="presentation" />
          </div>
          <div class="video-description">
            <h3>${i18nString(UIStrings.videoAndDocumentation)}</h3>
            <x-link class="quick-start-link" href=${this.#props.quickStartUrl}>${this.#props.quickStartLinkText}</x-link>
          </div>
        </div>
      </div>
      `, this.#shadow, { host: this });
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-panel-feedback', PanelFeedback);
//# sourceMappingURL=PanelFeedback.js.map