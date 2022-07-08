// Copyright (c) 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as IconButton from '../../../ui/components/icon_button/icon_button.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import stylePropertyEditorStyles from './stylePropertyEditor.css.js';
import { findFlexContainerIcon, findGridContainerIcon } from './CSSPropertyIconResolver.js';
const UIStrings = {
    /**
      * @description Title of the button that selects a flex property.
      * @example {flex-direction} propertyName
      * @example {column} propertyValue
      */
    selectButton: 'Add {propertyName}: {propertyValue}',
    /**
      * @description Title of the button that deselects a flex property.
      * @example {flex-direction} propertyName
      * @example {row} propertyValue
      */
    deselectButton: 'Remove {propertyName}: {propertyValue}',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/components/StylePropertyEditor.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const { render, html, Directives } = LitHtml;
export class PropertySelectedEvent extends Event {
    static eventName = 'propertyselected';
    data;
    constructor(name, value) {
        super(PropertySelectedEvent.eventName, {});
        this.data = { name, value };
    }
}
export class PropertyDeselectedEvent extends Event {
    static eventName = 'propertydeselected';
    data;
    constructor(name, value) {
        super(PropertyDeselectedEvent.eventName, {});
        this.data = { name, value };
    }
}
// eslint-disable-next-line rulesdir/check_component_naming
export class StylePropertyEditor extends HTMLElement {
    #shadow = this.attachShadow({ mode: 'open' });
    #authoredProperties = new Map();
    #computedProperties = new Map();
    editableProperties = [];
    constructor() {
        super();
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [stylePropertyEditorStyles];
    }
    getEditableProperties() {
        return this.editableProperties;
    }
    set data(data) {
        this.#authoredProperties = data.authoredProperties;
        this.#computedProperties = data.computedProperties;
        this.#render();
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        render(html `
      <div class="container">
        ${this.editableProperties.map(prop => this.#renderProperty(prop))}
      </div>
    `, this.#shadow, {
            host: this,
        });
        // clang-format on
    }
    #renderProperty(prop) {
        const authoredValue = this.#authoredProperties.get(prop.propertyName);
        const notAuthored = !authoredValue;
        const shownValue = authoredValue || this.#computedProperties.get(prop.propertyName);
        const classes = Directives.classMap({
            'property-value': true,
            'not-authored': notAuthored,
        });
        return html `<div class="row">
      <div class="property">
        <span class="property-name">${prop.propertyName}</span>: <span class=${classes}>${shownValue}</span>
      </div>
      <div class="buttons">
        ${prop.propertyValues.map(value => this.#renderButton(value, prop.propertyName, value === authoredValue))}
      </div>
    </div>`;
    }
    #renderButton(propertyValue, propertyName, selected = false) {
        const query = `${propertyName}: ${propertyValue}`;
        const iconInfo = this.findIcon(query, this.#computedProperties);
        if (!iconInfo) {
            throw new Error(`Icon for ${query} is not found`);
        }
        const transform = `transform: rotate(${iconInfo.rotate}deg) scale(${iconInfo.scaleX}, ${iconInfo.scaleY})`;
        const classes = Directives.classMap({
            'button': true,
            'selected': selected,
        });
        const values = { propertyName, propertyValue };
        const title = selected ? i18nString(UIStrings.deselectButton, values) : i18nString(UIStrings.selectButton, values);
        return html `<button title=${title} class=${classes} @click=${() => this.#onButtonClick(propertyName, propertyValue, selected)}>
       <${IconButton.Icon.Icon.litTagName} style=${transform} .data=${{ iconName: iconInfo.iconName, color: 'var(--icon-color)', width: '18px', height: '18px' }}></${IconButton.Icon.Icon.litTagName}>
    </button>`;
    }
    #onButtonClick(propertyName, propertyValue, selected) {
        if (selected) {
            this.dispatchEvent(new PropertyDeselectedEvent(propertyName, propertyValue));
        }
        else {
            this.dispatchEvent(new PropertySelectedEvent(propertyName, propertyValue));
        }
    }
    findIcon(_query, _computedProperties) {
        throw new Error('Not implemented');
    }
}
export class FlexboxEditor extends StylePropertyEditor {
    editableProperties = FlexboxEditableProperties;
    findIcon(query, computedProperties) {
        return findFlexContainerIcon(query, computedProperties);
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-flexbox-editor', FlexboxEditor);
export class GridEditor extends StylePropertyEditor {
    editableProperties = GridEditableProperties;
    findIcon(query, computedProperties) {
        return findGridContainerIcon(query, computedProperties);
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-grid-editor', GridEditor);
export const FlexboxEditableProperties = [
    {
        propertyName: 'flex-direction',
        propertyValues: [
            'row',
            'column',
            'row-reverse',
            'column-reverse',
        ],
    },
    {
        propertyName: 'flex-wrap',
        propertyValues: [
            'nowrap',
            'wrap',
        ],
    },
    {
        propertyName: 'align-content',
        propertyValues: [
            'center',
            'flex-start',
            'flex-end',
            'space-around',
            'space-between',
            'stretch',
        ],
    },
    {
        propertyName: 'justify-content',
        propertyValues: [
            'center',
            'flex-start',
            'flex-end',
            'space-between',
            'space-around',
            'space-evenly',
        ],
    },
    {
        propertyName: 'align-items',
        propertyValues: [
            'center',
            'flex-start',
            'flex-end',
            'stretch',
            'baseline',
        ],
    },
];
export const GridEditableProperties = [
    {
        propertyName: 'align-content',
        propertyValues: [
            'center',
            'space-between',
            'space-around',
            'space-evenly',
            'stretch',
        ],
    },
    {
        propertyName: 'justify-content',
        propertyValues: [
            'center',
            'start',
            'end',
            'space-between',
            'space-around',
            'space-evenly',
        ],
    },
    {
        propertyName: 'align-items',
        propertyValues: [
            'center',
            'start',
            'end',
            'stretch',
            'baseline',
        ],
    },
    {
        propertyName: 'justify-items',
        propertyValues: [
            'center',
            'start',
            'end',
            'stretch',
        ],
    },
];
//# sourceMappingURL=StylePropertyEditor.js.map