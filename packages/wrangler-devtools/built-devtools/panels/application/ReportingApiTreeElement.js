// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ApplicationPanelTreeElement } from './ApplicationPanelTreeElement.js';
import { ReportingApiView } from './ReportingApiView.js';
const UIStrings = {
    /**
    *@description Label for an item in the Application Panel Sidebar of the Application panel
    */
    reportingApi: 'Reporting API',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/ReportingApiTreeElement.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ReportingApiTreeElement extends ApplicationPanelTreeElement {
    view;
    constructor(storagePanel) {
        super(storagePanel, i18nString(UIStrings.reportingApi), false);
        const icon = UI.Icon.Icon.create('mediumicon-manifest', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'reportingApi://';
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view = new ReportingApiView();
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.reporting_api]);
        return false;
    }
}
//# sourceMappingURL=ReportingApiTreeElement.js.map