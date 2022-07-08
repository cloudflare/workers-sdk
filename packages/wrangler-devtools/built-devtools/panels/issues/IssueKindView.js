// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import * as Adorners from '../../ui/components/adorners/adorners.js';
import * as IconButton from '../../ui/components/icon_button/icon_button.js';
import * as IssueCounter from '../../ui/components/issue_counter/issue_counter.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Components from './components/components.js';
const UIStrings = {
    /**
      * @description Menu entry for hiding all current Page Errors.
      */
    hideAllCurrentPageErrors: 'Hide all current Page Errors',
    /**
      * @description Menu entry for hiding all current Breaking Changes.
      */
    hideAllCurrentBreakingChanges: 'Hide all current Breaking Changes',
    /**
      * @description Menu entry for hiding all current Page Errors.
      */
    hideAllCurrentImprovements: 'Hide all current Improvements',
};
const str_ = i18n.i18n.registerUIStrings('panels/issues/IssueKindView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export function getGroupIssuesByKindSetting() {
    return Common.Settings.Settings.instance().createSetting('groupIssuesByKind', false);
}
export function issueKindViewSortPriority(a, b) {
    if (a.getKind() === b.getKind()) {
        return 0;
    }
    if (a.getKind() === IssuesManager.Issue.IssueKind.PageError) {
        return -1;
    }
    if (a.getKind() === IssuesManager.Issue.IssueKind.BreakingChange &&
        b.getKind() === IssuesManager.Issue.IssueKind.Improvement) {
        return -1;
    }
    return 1;
}
export function getClassNameFromKind(kind) {
    switch (kind) {
        case IssuesManager.Issue.IssueKind.BreakingChange:
            return 'breaking-changes';
        case IssuesManager.Issue.IssueKind.Improvement:
            return 'improvements';
        case IssuesManager.Issue.IssueKind.PageError:
            return 'page-errors';
    }
}
export class IssueKindView extends UI.TreeOutline.TreeElement {
    #kind;
    #issueCount;
    constructor(kind) {
        super(undefined, true);
        this.#kind = kind;
        this.#issueCount = document.createElement('span');
        this.toggleOnClick = true;
        this.listItemElement.classList.add('issue-kind');
        this.listItemElement.classList.add(getClassNameFromKind(kind));
        this.childrenListElement.classList.add('issue-kind-body');
    }
    getKind() {
        return this.#kind;
    }
    getHideAllCurrentKindString() {
        switch (this.#kind) {
            case IssuesManager.Issue.IssueKind.PageError:
                return i18nString(UIStrings.hideAllCurrentPageErrors);
            case IssuesManager.Issue.IssueKind.Improvement:
                return i18nString(UIStrings.hideAllCurrentImprovements);
            case IssuesManager.Issue.IssueKind.BreakingChange:
                return i18nString(UIStrings.hideAllCurrentBreakingChanges);
        }
    }
    #appendHeader() {
        const header = document.createElement('div');
        header.classList.add('header');
        const issueKindIcon = new IconButton.Icon.Icon();
        issueKindIcon.data = IssueCounter.IssueCounter.getIssueKindIconData(this.#kind);
        issueKindIcon.classList.add('leading-issue-icon');
        const countAdorner = new Adorners.Adorner.Adorner();
        countAdorner.data = {
            name: 'countWrapper',
            content: this.#issueCount,
        };
        countAdorner.classList.add('aggregated-issues-count');
        this.#issueCount.textContent = '0';
        const title = document.createElement('div');
        title.classList.add('title');
        title.textContent = IssuesManager.Issue.getIssueKindName(this.#kind);
        const hideAvailableIssuesBtn = new Components.HideIssuesMenu.HideIssuesMenu();
        hideAvailableIssuesBtn.classList.add('hide-available-issues');
        hideAvailableIssuesBtn.data = {
            menuItemLabel: this.getHideAllCurrentKindString(),
            menuItemAction: () => {
                const setting = IssuesManager.IssuesManager.getHideIssueByCodeSetting();
                const values = setting.get();
                for (const issue of IssuesManager.IssuesManager.IssuesManager.instance().issues()) {
                    if (issue.getKind() === this.#kind) {
                        values[issue.code()] = "Hidden" /* Hidden */;
                    }
                }
                setting.set(values);
            },
        };
        header.appendChild(issueKindIcon);
        header.appendChild(countAdorner);
        header.appendChild(title);
        header.appendChild(hideAvailableIssuesBtn);
        this.listItemElement.appendChild(header);
    }
    onattach() {
        this.#appendHeader();
        this.expand();
    }
    update(count) {
        this.#issueCount.textContent = `${count}`;
    }
}
//# sourceMappingURL=IssueKindView.js.map