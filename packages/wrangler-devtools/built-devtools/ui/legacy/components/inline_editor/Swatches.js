// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../../core/common/common.js';
import * as TextUtils from '../../../../models/text_utils/text_utils.js';
import * as UI from '../../legacy.js';
import { ColorSwatch, FormatChangedEvent } from './ColorSwatch.js';
import bezierSwatchStyles from './bezierSwatch.css.js';
import cssShadowSwatchStyles from './cssShadowSwatch.css.js';
export class BezierSwatch extends HTMLSpanElement {
    iconElementInternal;
    textElement;
    constructor() {
        super();
        const root = UI.Utils.createShadowRootWithCoreStyles(this, {
            cssFile: [bezierSwatchStyles],
            delegatesFocus: undefined,
        });
        this.iconElementInternal = UI.Icon.Icon.create('smallicon-bezier', 'bezier-swatch-icon');
        root.appendChild(this.iconElementInternal);
        this.textElement = this.createChild('span');
        root.createChild('slot');
    }
    static create() {
        let constructor = BezierSwatch.constructorInternal;
        if (!constructor) {
            constructor = UI.Utils.registerCustomElement('span', 'bezier-swatch', BezierSwatch);
            BezierSwatch.constructorInternal = constructor;
        }
        return constructor();
    }
    bezierText() {
        return this.textElement.textContent || '';
    }
    setBezierText(text) {
        this.textElement.textContent = text;
    }
    hideText(hide) {
        this.textElement.hidden = hide;
    }
    iconElement() {
        return this.iconElementInternal;
    }
    static constructorInternal = null;
}
export class CSSShadowSwatch extends HTMLSpanElement {
    iconElementInternal;
    contentElement;
    colorSwatchInternal;
    modelInternal;
    constructor() {
        super();
        const root = UI.Utils.createShadowRootWithCoreStyles(this, {
            cssFile: [cssShadowSwatchStyles],
            delegatesFocus: undefined,
        });
        this.iconElementInternal = UI.Icon.Icon.create('smallicon-shadow', 'shadow-swatch-icon');
        root.appendChild(this.iconElementInternal);
        root.createChild('slot');
        this.contentElement = this.createChild('span');
    }
    static create() {
        let constructor = CSSShadowSwatch.constructorInternal;
        if (!constructor) {
            constructor = UI.Utils.registerCustomElement('span', 'css-shadow-swatch', CSSShadowSwatch);
            CSSShadowSwatch.constructorInternal = constructor;
        }
        return constructor();
    }
    model() {
        return this.modelInternal;
    }
    setCSSShadow(model) {
        this.modelInternal = model;
        this.contentElement.removeChildren();
        const results = TextUtils.TextUtils.Utils.splitStringByRegexes(model.asCSSText(), [/!important/g, /inset/g, Common.Color.Regex]);
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.regexIndex === 2) {
                if (!this.colorSwatchInternal) {
                    this.colorSwatchInternal = new ColorSwatch();
                    const value = this.colorSwatchInternal.createChild('span');
                    this.colorSwatchInternal.addEventListener(FormatChangedEvent.eventName, (event) => {
                        value.textContent = event.data.text;
                    });
                }
                this.colorSwatchInternal.renderColor(model.color());
                const value = this.colorSwatchInternal.querySelector('span');
                if (value) {
                    value.textContent = model.color().asString();
                }
                this.contentElement.appendChild(this.colorSwatchInternal);
            }
            else {
                this.contentElement.appendChild(document.createTextNode(result.value));
            }
        }
    }
    hideText(hide) {
        this.contentElement.hidden = hide;
    }
    iconElement() {
        return this.iconElementInternal;
    }
    colorSwatch() {
        return this.colorSwatchInternal;
    }
    static constructorInternal = null;
}
//# sourceMappingURL=Swatches.js.map