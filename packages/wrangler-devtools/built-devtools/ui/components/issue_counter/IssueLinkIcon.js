// Copyright (c) 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Common from '../../../core/common/common.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as IconButton from '../../../ui/components/icon_button/icon_button.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import * as IssuesManager from '../../../models/issues_manager/issues_manager.js';
import * as Coordinator from '../../../ui/components/render_coordinator/render_coordinator.js';
import IssueLinkIconStyles from './issueLinkIcon.css.js';
import { getIssueKindIconData } from './IssueCounter.js';
const UIStrings = {
    /**
     * @description Title for a link to show an issue in the issues tab
     */
    clickToShowIssue: 'Click to show issue in the issues tab',
    /**
     * @description Title for a link to show an issue in the issues tab
     * @example {A title of an Issue} title
     */
    clickToShowIssueWithTitle: 'Click to open the issue tab and show issue: {title}',
    /**
     *@description Title for an link to show an issue that is unavailable because the issue couldn't be resolved
     */
    issueUnavailable: 'Issue unavailable at this time',
};
const str_ = i18n.i18n.registerUIStrings('ui/components/issue_counter/IssueLinkIcon.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export const extractShortPath = (path) => {
    // 1st regex matches everything after last '/'
    // if path ends with '/', 2nd regex returns everything between the last two '/'
    return (/[^/]+$/.exec(path) || /[^/]+\/$/.exec(path) || [''])[0];
};
const coordinator = Coordinator.RenderCoordinator.RenderCoordinator.instance();
export class IssueLinkIcon extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-issue-link-icon`;
    #shadow = this.attachShadow({ mode: 'open' });
    // The value `null` indicates that the issue is not available,
    // `undefined` that it is still being resolved.
    #issue;
    #issueTitle = null;
    #issueTitlePromise = Promise.resolve(undefined);
    #issueId;
    #issueResolver;
    #additionalOnClickAction;
    #reveal = Common.Revealer.reveal;
    #issueResolvedPromise = Promise.resolve(undefined);
    set data(data) {
        this.#issue = data.issue;
        this.#issueId = data.issueId;
        if (!this.#issue && !this.#issueId) {
            throw new Error('Either `issue` or `issueId` must be provided');
        }
        this.#issueResolver = data.issueResolver;
        this.#additionalOnClickAction = data.additionalOnClickAction;
        if (data.revealOverride) {
            this.#reveal = data.revealOverride;
        }
        if (!this.#issue && this.#issueId) {
            this.#issueResolvedPromise = this.#resolveIssue(this.#issueId);
            this.#issueTitlePromise = this.#issueResolvedPromise.then(() => this.#fetchIssueTitle());
        }
        else {
            this.#issueTitlePromise = this.#fetchIssueTitle();
        }
        void this.#render();
    }
    async #fetchIssueTitle() {
        const description = this.#issue?.getDescription();
        if (!description) {
            return;
        }
        const title = await IssuesManager.MarkdownIssueDescription.getIssueTitleFromMarkdownDescription(description);
        if (title) {
            this.#issueTitle = title;
        }
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [IssueLinkIconStyles];
    }
    #resolveIssue(issueId) {
        if (!this.#issueResolver) {
            throw new Error('An `IssueResolver` must be provided if an `issueId` is provided.');
        }
        return this.#issueResolver.waitFor(issueId)
            .then(issue => {
            this.#issue = issue;
        })
            .catch(() => {
            this.#issue = null;
        });
    }
    get data() {
        return {
            issue: this.#issue,
            issueId: this.#issueId,
            issueResolver: this.#issueResolver,
            additionalOnClickAction: this.#additionalOnClickAction,
            revealOverride: this.#reveal !== Common.Revealer.reveal ? this.#reveal : undefined,
        };
    }
    iconData() {
        if (this.#issue) {
            return getIssueKindIconData(this.#issue.getKind());
        }
        return { iconName: 'issue-questionmark-icon', color: 'var(--color-text-secondary)', width: '16px', height: '16px' };
    }
    handleClick(event) {
        if (event.button !== 0) {
            return; // Only handle left-click for now.
        }
        if (this.#issue) {
            void this.#reveal(this.#issue);
        }
        this.#additionalOnClickAction?.();
    }
    #getTooltip() {
        if (this.#issueTitle) {
            return i18nString(UIStrings.clickToShowIssueWithTitle, { title: this.#issueTitle });
        }
        if (this.#issue) {
            return i18nString(UIStrings.clickToShowIssue);
        }
        return i18nString(UIStrings.issueUnavailable);
    }
    #render() {
        return coordinator.write(() => {
            // clang-format off
            LitHtml.render(LitHtml.html `
        ${LitHtml.Directives.until(this.#issueTitlePromise.then(() => this.#renderComponent()), this.#issueResolvedPromise.then(() => this.#renderComponent()), this.#renderComponent())}
      `, this.#shadow, { host: this });
            // clang-format on
        });
    }
    #renderComponent() {
        // clang-format off
        return LitHtml.html `
      <span class=${LitHtml.Directives.classMap({ 'link': Boolean(this.#issue) })}
            tabindex="0"
            @click=${this.handleClick}>
        <${IconButton.Icon.Icon.litTagName} .data=${this.iconData()}
          title=${this.#getTooltip()}></${IconButton.Icon.Icon.litTagName}>
      </span>`;
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-issue-link-icon', IssueLinkIcon);
//# sourceMappingURL=IssueLinkIcon.js.map