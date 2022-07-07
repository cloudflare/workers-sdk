// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { AffectedResourcesView } from './AffectedResourcesView.js';
const UIStrings = {
    /**
    *@description Noun for singular or plural number of affected element resource indication in issue view.
    */
    nElements: '{n, plural, =1 {# element} other {# elements}}',
};
const str_ = i18n.i18n.registerUIStrings('panels/issues/AffectedElementsView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class AffectedElementsView extends AffectedResourcesView {
    async #appendAffectedElements(affectedElements) {
        let count = 0;
        for (const element of affectedElements) {
            await this.#appendAffectedElement(element);
            count++;
        }
        this.updateAffectedResourceCount(count);
    }
    getResourceNameWithCount(count) {
        return i18nString(UIStrings.nElements, { n: count });
    }
    async #appendAffectedElement(element) {
        const cellElement = await this.createElementCell(element, this.issue.getCategory());
        const rowElement = document.createElement('tr');
        rowElement.appendChild(cellElement);
        this.affectedResources.appendChild(rowElement);
    }
    update() {
        this.clear();
        void this.#appendAffectedElements(this.issue.elements());
    }
}
//# sourceMappingURL=AffectedElementsView.js.map