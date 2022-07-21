// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ApplicationPanelTreeElement } from './ApplicationPanelTreeElement.js';
import { InterestGroupStorageView } from './InterestGroupStorageView.js';
const UIStrings = {
    /**
    *@description Label for an item in the Application Panel Sidebar of the Application panel
    * An interest group is an ad targeting group stored on the browser that can
    * be used to show a certain set of advertisements in the future as the
    * outcome of a FLEDGE auction. (https://developer.chrome.com/blog/fledge-api/)
    */
    interestGroups: 'Interest Groups',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/InterestGroupTreeElement.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class InterestGroupTreeElement extends ApplicationPanelTreeElement {
    view;
    constructor(storagePanel) {
        super(storagePanel, i18nString(UIStrings.interestGroups), false);
        const interestGroupIcon = UI.Icon.Icon.create('mediumicon-database', 'resource-tree-item');
        this.setLeadingIcons([interestGroupIcon]);
        this.view = new InterestGroupStorageView(this);
    }
    get itemURL() {
        return 'interest-groups://';
    }
    async getInterestGroupDetails(owner, name) {
        const mainTarget = SDK.TargetManager.TargetManager.instance().mainTarget();
        if (!mainTarget) {
            return null;
        }
        const response = await mainTarget.storageAgent().invoke_getInterestGroupDetails({ 'ownerOrigin': owner, 'name': name });
        return response.details;
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.interest_groups]);
        return false;
    }
    addEvent(event) {
        this.view.addEvent(event);
    }
    clearEvents() {
        this.view.clearEvents();
    }
}
//# sourceMappingURL=InterestGroupTreeElement.js.map