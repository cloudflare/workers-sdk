// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { PseudoStateMarkerDecorator } from './ElementsPanel.js';
const UIStrings = {
    /**
    *@description Title of the Marker Decorator of Elements
    */
    domBreakpoint: 'DOM Breakpoint',
    /**
    *@description Title of the Marker Decorator of Elements
    */
    elementIsHidden: 'Element is hidden',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/MarkerDecorator.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class GenericDecorator {
    title;
    color;
    constructor(extension) {
        if (!extension.title || !extension.color) {
            throw new Error(`Generic decorator requires a color and a title: ${extension.marker}`);
        }
        this.title = extension.title();
        this.color = extension.color;
    }
    decorate(_node) {
        return { title: this.title, color: this.color };
    }
}
const domBreakpointData = {
    marker: 'breakpoint-marker',
    title: i18nLazyString(UIStrings.domBreakpoint),
    color: 'rgb(105, 140, 254)',
};
const elementIsHiddenData = {
    marker: 'hidden-marker',
    title: i18nLazyString(UIStrings.elementIsHidden),
    color: '#555',
};
export function getRegisteredDecorators() {
    return [
        {
            ...domBreakpointData,
            decorator: () => new GenericDecorator(domBreakpointData),
        },
        {
            ...elementIsHiddenData,
            decorator: () => new GenericDecorator(elementIsHiddenData),
        },
        {
            decorator: PseudoStateMarkerDecorator.instance,
            marker: 'pseudo-state-marker',
            title: undefined,
            color: undefined,
        },
    ];
}
//# sourceMappingURL=MarkerDecorator.js.map