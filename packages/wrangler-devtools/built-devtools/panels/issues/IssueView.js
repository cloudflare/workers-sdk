// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import * as IconButton from '../../ui/components/icon_button/icon_button.js';
import * as IssueCounter from '../../ui/components/issue_counter/issue_counter.js';
import * as MarkdownView from '../../ui/components/markdown_view/markdown_view.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Adorners from '../../ui/components/adorners/adorners.js';
import * as NetworkForward from '../../panels/network/forward/forward.js';
import * as Root from '../../core/root/root.js';
import * as Components from './components/components.js';
import { AffectedDirectivesView } from './AffectedDirectivesView.js';
import { AffectedBlockedByResponseView } from './AffectedBlockedByResponseView.js';
import { AffectedCookiesView, AffectedRawCookieLinesView } from './AffectedCookiesView.js';
import { AffectedDocumentsInQuirksModeView } from './AffectedDocumentsInQuirksModeView.js';
import { AffectedElementsView } from './AffectedElementsView.js';
import { AffectedElementsWithLowContrastView } from './AffectedElementsWithLowContrastView.js';
import { AffectedHeavyAdView } from './AffectedHeavyAdView.js';
import { AffectedResourcesView, extractShortPath } from './AffectedResourcesView.js';
import { AffectedSharedArrayBufferIssueDetailsView } from './AffectedSharedArrayBufferIssueDetailsView.js';
import { AffectedSourcesView } from './AffectedSourcesView.js';
import { AffectedTrustedWebActivityIssueDetailsView } from './AffectedTrustedWebActivityIssueDetailsView.js';
import { CorsIssueDetailsView } from './CorsIssueDetailsView.js';
import { GenericIssueDetailsView } from './GenericIssueDetailsView.js';
import { AttributionReportingIssueDetailsView } from './AttributionReportingIssueDetailsView.js';
const UIStrings = {
    /**
    *@description Noun, singular. Label for a column or field containing the name of an entity.
    */
    name: 'Name',
    /**
    *@description The kind of resolution for a mixed content issue
    */
    blocked: 'blocked',
    /**
    *@description Label for a type of issue that can appear in the Issues view. Noun for singular or plural number of network requests.
    */
    nRequests: '{n, plural, =1 {# request} other {# requests}}',
    /**
    *@description Label for singular or plural number of affected resources in issue view
    */
    nResources: '{n, plural, =1 {# resource} other {# resources}}',
    /**
    *@description Label for mixed content issue's restriction status
    */
    restrictionStatus: 'Restriction Status',
    /**
    * @description When there is a Heavy Ad, the browser can choose to deal with it in different ways.
    * This string indicates that the ad was only warned, and not removed.
    */
    warned: 'Warned',
    /**
    *@description Header for the section listing affected resources
    */
    affectedResources: 'Affected Resources',
    /**
    *@description Title for a link to further information in issue view
    *@example {SameSite Cookies Explained} PH1
    */
    learnMoreS: 'Learn more: {PH1}',
    /**
    *@description The kind of resolution for a mixed content issue
    */
    automaticallyUpgraded: 'automatically upgraded',
    /**
    *@description Menu entry for hiding a particular issue, in the Hide Issues context menu.
    */
    hideIssuesLikeThis: 'Hide issues like this',
    /**
    *@description Menu entry for unhiding a particular issue, in the Hide Issues context menu.
    */
    unhideIssuesLikeThis: 'Unhide issues like this',
};
const str_ = i18n.i18n.registerUIStrings('panels/issues/IssueView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
class AffectedRequestsView extends AffectedResourcesView {
    #appendAffectedRequests(affectedRequests) {
        let count = 0;
        for (const affectedRequest of affectedRequests) {
            const element = document.createElement('tr');
            element.classList.add('affected-resource-request');
            const category = this.issue.getCategory();
            const tab = issueTypeToNetworkHeaderMap.get(category) || NetworkForward.UIRequestLocation.UIRequestTabs.Headers;
            element.appendChild(this.createRequestCell(affectedRequest, {
                networkTab: tab,
                additionalOnClickAction() {
                    Host.userMetrics.issuesPanelResourceOpened(category, "Request" /* Request */);
                },
            }));
            this.affectedResources.appendChild(element);
            count++;
        }
        this.updateAffectedResourceCount(count);
    }
    getResourceNameWithCount(count) {
        return i18nString(UIStrings.nRequests, { n: count });
    }
    update() {
        this.clear();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const unused of this.issue.getBlockedByResponseDetails()) {
            // If the issue has blockedByResponseDetails, the corresponding AffectedBlockedByResponseView
            // will take care of displaying the request.
            this.updateAffectedResourceCount(0);
            return;
        }
        if (this.issue.getCategory() === IssuesManager.Issue.IssueCategory.MixedContent) {
            // The AffectedMixedContentView takes care of displaying the resources.
            this.updateAffectedResourceCount(0);
            return;
        }
        this.#appendAffectedRequests(this.issue.requests());
    }
}
const issueTypeToNetworkHeaderMap = new Map([
    [
        IssuesManager.Issue.IssueCategory.Cookie,
        NetworkForward.UIRequestLocation.UIRequestTabs.Cookies,
    ],
    [
        IssuesManager.Issue.IssueCategory.CrossOriginEmbedderPolicy,
        NetworkForward.UIRequestLocation.UIRequestTabs.Headers,
    ],
    [
        IssuesManager.Issue.IssueCategory.MixedContent,
        NetworkForward.UIRequestLocation.UIRequestTabs.Headers,
    ],
]);
class AffectedMixedContentView extends AffectedResourcesView {
    #appendAffectedMixedContentDetails(mixedContentIssues) {
        const header = document.createElement('tr');
        this.appendColumnTitle(header, i18nString(UIStrings.name));
        this.appendColumnTitle(header, i18nString(UIStrings.restrictionStatus));
        this.affectedResources.appendChild(header);
        let count = 0;
        for (const issue of mixedContentIssues) {
            const details = issue.getDetails();
            this.appendAffectedMixedContent(details);
            count++;
        }
        this.updateAffectedResourceCount(count);
    }
    getResourceNameWithCount(count) {
        return i18nString(UIStrings.nResources, { n: count });
    }
    appendAffectedMixedContent(mixedContent) {
        const element = document.createElement('tr');
        element.classList.add('affected-resource-mixed-content');
        if (mixedContent.request) {
            const networkTab = issueTypeToNetworkHeaderMap.get(this.issue.getCategory()) ||
                NetworkForward.UIRequestLocation.UIRequestTabs.Headers;
            element.appendChild(this.createRequestCell(mixedContent.request, {
                networkTab,
                additionalOnClickAction() {
                    Host.userMetrics.issuesPanelResourceOpened(IssuesManager.Issue.IssueCategory.MixedContent, "Request" /* Request */);
                },
            }));
        }
        else {
            const filename = extractShortPath(mixedContent.insecureURL);
            const cell = this.appendIssueDetailCell(element, filename, 'affected-resource-mixed-content-info');
            cell.title = mixedContent.insecureURL;
        }
        this.appendIssueDetailCell(element, AffectedMixedContentView.translateStatus(mixedContent.resolutionStatus), 'affected-resource-mixed-content-info');
        this.affectedResources.appendChild(element);
    }
    static translateStatus(resolutionStatus) {
        switch (resolutionStatus) {
            case "MixedContentBlocked" /* MixedContentBlocked */:
                return i18nString(UIStrings.blocked);
            case "MixedContentAutomaticallyUpgraded" /* MixedContentAutomaticallyUpgraded */:
                return i18nString(UIStrings.automaticallyUpgraded);
            case "MixedContentWarning" /* MixedContentWarning */:
                return i18nString(UIStrings.warned);
        }
    }
    update() {
        this.clear();
        this.#appendAffectedMixedContentDetails(this.issue.getMixedContentIssues());
    }
}
export class IssueView extends UI.TreeOutline.TreeElement {
    #issue;
    #description;
    toggleOnClick;
    affectedResources;
    #affectedResourceViews;
    #aggregatedIssuesCount;
    #issueKindIcon = null;
    #hasBeenExpandedBefore;
    #throttle;
    #needsUpdateOnExpand = true;
    #hiddenIssuesMenu;
    #contentCreated = false;
    constructor(issue, description) {
        super();
        this.#issue = issue;
        this.#description = description;
        this.#throttle = new Common.Throttler.Throttler(250);
        this.toggleOnClick = true;
        this.listItemElement.classList.add('issue');
        this.childrenListElement.classList.add('body');
        this.childrenListElement.classList.add(IssueView.getBodyCSSClass(this.#issue.getKind()));
        this.affectedResources = this.#createAffectedResources();
        this.#affectedResourceViews = [
            new AffectedCookiesView(this, this.#issue),
            new AffectedElementsView(this, this.#issue),
            new AffectedRequestsView(this, this.#issue),
            new AffectedMixedContentView(this, this.#issue),
            new AffectedSourcesView(this, this.#issue),
            new AffectedHeavyAdView(this, this.#issue),
            new AffectedDirectivesView(this, this.#issue),
            new AffectedBlockedByResponseView(this, this.#issue),
            new AffectedSharedArrayBufferIssueDetailsView(this, this.#issue),
            new AffectedElementsWithLowContrastView(this, this.#issue),
            new AffectedTrustedWebActivityIssueDetailsView(this, this.#issue),
            new CorsIssueDetailsView(this, this.#issue),
            new GenericIssueDetailsView(this, this.#issue),
            new AffectedDocumentsInQuirksModeView(this, this.#issue),
            new AttributionReportingIssueDetailsView(this, this.#issue),
            new AffectedRawCookieLinesView(this, this.#issue),
        ];
        if (Root.Runtime.experiments.isEnabled('hideIssuesFeature')) {
            this.#hiddenIssuesMenu = new Components.HideIssuesMenu.HideIssuesMenu();
        }
        this.#aggregatedIssuesCount = null;
        this.#hasBeenExpandedBefore = false;
    }
    /**
     * Sets the issue to take the resources from. Assumes that the description
     * this IssueView was initialized with fits the new issue as well, i.e.
     * title and issue description will not be updated.
     */
    setIssue(issue) {
        if (this.#issue !== issue) {
            this.#needsUpdateOnExpand = true;
        }
        this.#issue = issue;
        this.#affectedResourceViews.forEach(view => view.setIssue(issue));
    }
    static getBodyCSSClass(issueKind) {
        switch (issueKind) {
            case IssuesManager.Issue.IssueKind.BreakingChange:
                return 'issue-kind-breaking-change';
            case IssuesManager.Issue.IssueKind.PageError:
                return 'issue-kind-page-error';
            case IssuesManager.Issue.IssueKind.Improvement:
                return 'issue-kind-improvement';
        }
    }
    getIssueTitle() {
        return this.#description.title;
    }
    onattach() {
        if (!this.#contentCreated) {
            this.createContent();
            return;
        }
        this.update();
    }
    createContent() {
        this.#appendHeader();
        this.#createBody();
        this.appendChild(this.affectedResources);
        for (const view of this.#affectedResourceViews) {
            this.appendAffectedResource(view);
            view.update();
        }
        this.#createReadMoreLinks();
        this.updateAffectedResourceVisibility();
        this.#contentCreated = true;
    }
    appendAffectedResource(resource) {
        this.affectedResources.appendChild(resource);
    }
    #appendHeader() {
        const header = document.createElement('div');
        header.classList.add('header');
        this.#issueKindIcon = new IconButton.Icon.Icon();
        this.#issueKindIcon.classList.add('leading-issue-icon');
        this.#aggregatedIssuesCount = document.createElement('span');
        const countAdorner = new Adorners.Adorner.Adorner();
        countAdorner.data = {
            name: 'countWrapper',
            content: this.#aggregatedIssuesCount,
        };
        countAdorner.classList.add('aggregated-issues-count');
        header.appendChild(this.#issueKindIcon);
        header.appendChild(countAdorner);
        const title = document.createElement('div');
        title.classList.add('title');
        title.textContent = this.#description.title;
        header.appendChild(title);
        if (this.#hiddenIssuesMenu) {
            header.appendChild(this.#hiddenIssuesMenu);
        }
        this.#updateFromIssue();
        this.listItemElement.appendChild(header);
    }
    onexpand() {
        Host.userMetrics.issuesPanelIssueExpanded(this.#issue.getCategory());
        if (this.#needsUpdateOnExpand) {
            this.#doUpdate();
        }
        if (!this.#hasBeenExpandedBefore) {
            this.#hasBeenExpandedBefore = true;
            for (const view of this.#affectedResourceViews) {
                view.expandIfOneResource();
            }
        }
    }
    #updateFromIssue() {
        if (this.#issueKindIcon) {
            const kind = this.#issue.getKind();
            this.#issueKindIcon.data = IssueCounter.IssueCounter.getIssueKindIconData(kind);
            this.#issueKindIcon.title = IssuesManager.Issue.getIssueKindDescription(kind);
        }
        if (this.#aggregatedIssuesCount) {
            this.#aggregatedIssuesCount.textContent = `${this.#issue.getAggregatedIssuesCount()}`;
        }
        this.listItemElement.classList.toggle('hidden-issue', this.#issue.isHidden());
        if (this.#hiddenIssuesMenu) {
            const data = {
                menuItemLabel: this.#issue.isHidden() ? i18nString(UIStrings.unhideIssuesLikeThis) :
                    i18nString(UIStrings.hideIssuesLikeThis),
                menuItemAction: () => {
                    const setting = IssuesManager.IssuesManager.getHideIssueByCodeSetting();
                    const values = setting.get();
                    values[this.#issue.code()] = this.#issue.isHidden() ? "Unhidden" /* Unhidden */ :
                        "Hidden" /* Hidden */;
                    setting.set(values);
                },
            };
            this.#hiddenIssuesMenu.data = data;
        }
    }
    updateAffectedResourceVisibility() {
        const noResources = this.#affectedResourceViews.every(view => view.isEmpty());
        this.affectedResources.hidden = noResources;
    }
    #createAffectedResources() {
        const wrapper = new UI.TreeOutline.TreeElement();
        wrapper.setCollapsible(false);
        wrapper.setExpandable(true);
        wrapper.expand();
        wrapper.selectable = false;
        wrapper.listItemElement.classList.add('affected-resources-label');
        wrapper.listItemElement.textContent = i18nString(UIStrings.affectedResources);
        wrapper.childrenListElement.classList.add('affected-resources');
        return wrapper;
    }
    #createBody() {
        const messageElement = new UI.TreeOutline.TreeElement();
        messageElement.setCollapsible(false);
        messageElement.selectable = false;
        const markdownComponent = new MarkdownView.MarkdownView.MarkdownView();
        markdownComponent.data = { tokens: this.#description.markdown };
        messageElement.listItemElement.appendChild(markdownComponent);
        this.appendChild(messageElement);
    }
    #createReadMoreLinks() {
        if (this.#description.links.length === 0) {
            return;
        }
        const linkWrapper = new UI.TreeOutline.TreeElement();
        linkWrapper.setCollapsible(false);
        linkWrapper.listItemElement.classList.add('link-wrapper');
        const linkList = linkWrapper.listItemElement.createChild('ul', 'link-list');
        for (const description of this.#description.links) {
            const link = UI.Fragment.html `<x-link class="link devtools-link" tabindex="0" href=${description.link}>${i18nString(UIStrings.learnMoreS, { PH1: description.linkTitle })}</x-link>`;
            const linkIcon = new IconButton.Icon.Icon();
            linkIcon.data = { iconName: 'link_icon', color: 'var(--color-link)', width: '16px', height: '16px' };
            linkIcon.classList.add('link-icon');
            link.prepend(linkIcon);
            link.addEventListener('x-link-invoke', () => {
                Host.userMetrics.issuesPanelResourceOpened(this.#issue.getCategory(), "LearnMore" /* LearnMore */);
            });
            const linkListItem = linkList.createChild('li');
            linkListItem.appendChild(link);
        }
        this.appendChild(linkWrapper);
    }
    #doUpdate() {
        if (this.expanded) {
            this.#affectedResourceViews.forEach(view => view.update());
            this.updateAffectedResourceVisibility();
        }
        this.#needsUpdateOnExpand = !this.expanded;
        this.#updateFromIssue();
    }
    update() {
        void this.#throttle.schedule(async () => this.#doUpdate());
    }
    getIssueKind() {
        return this.#issue.getKind();
    }
    isForHiddenIssue() {
        return this.#issue.isHidden();
    }
    toggle(expand) {
        if (expand || (expand === undefined && !this.expanded)) {
            this.expand();
        }
        else {
            this.collapse();
        }
    }
}
//# sourceMappingURL=IssueView.js.map