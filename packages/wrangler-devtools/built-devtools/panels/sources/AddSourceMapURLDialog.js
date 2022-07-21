// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';
import dialogStyles from './dialog.css.js';
const UIStrings = {
    /**
    *@description Text in Add Source Map URLDialog of the Sources panel
    */
    sourceMapUrl: 'Source map URL: ',
    /**
    *@description Text to add something
    */
    add: 'Add',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/AddSourceMapURLDialog.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class AddSourceMapURLDialog extends UI.Widget.HBox {
    input;
    dialog;
    callback;
    constructor(callback) {
        super(/* isWebComponent */ true);
        this.contentElement.createChild('label').textContent = i18nString(UIStrings.sourceMapUrl);
        this.input = UI.UIUtils.createInput('add-source-map', 'text');
        this.input.addEventListener('keydown', this.onKeyDown.bind(this), false);
        this.contentElement.appendChild(this.input);
        const addButton = UI.UIUtils.createTextButton(i18nString(UIStrings.add), this.apply.bind(this));
        this.contentElement.appendChild(addButton);
        this.dialog = new UI.Dialog.Dialog();
        this.dialog.setSizeBehavior("MeasureContent" /* MeasureContent */);
        this.dialog.setDefaultFocusedElement(this.input);
        this.callback = callback;
    }
    show() {
        super.show(this.dialog.contentElement);
        // UI.Dialog extends GlassPane and overrides the `show` method with a wider
        // accepted type. However, TypeScript uses the supertype declaration to
        // determine the full type, which requires a `!Document`.
        // @ts-ignore
        this.dialog.show();
    }
    done(value) {
        this.dialog.hide();
        this.callback(value);
    }
    apply() {
        this.done(this.input.value);
    }
    onKeyDown(event) {
        if (event.key === 'Enter') {
            event.consume(true);
            this.apply();
        }
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([dialogStyles]);
    }
}
//# sourceMappingURL=AddSourceMapURLDialog.js.map