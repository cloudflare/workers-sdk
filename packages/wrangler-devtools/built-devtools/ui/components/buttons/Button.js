// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as LitHtml from '../../lit-html/lit-html.js';
import * as ComponentHelpers from '../helpers/helpers.js';
import * as IconButton from '../icon_button/icon_button.js';
import buttonStyles from './button.css.js';
export class Button extends HTMLElement {
    static formAssociated = true;
    static litTagName = LitHtml.literal `devtools-button`;
    #shadow = this.attachShadow({ mode: 'open', delegatesFocus: true });
    #boundRender = this.#render.bind(this);
    #boundOnClick = this.#onClick.bind(this);
    #props = {
        size: "MEDIUM" /* MEDIUM */,
        disabled: false,
        active: false,
        spinner: false,
        type: 'button',
    };
    #isEmpty = true;
    #internals = this.attachInternals();
    constructor() {
        super();
        this.setAttribute('role', 'presentation');
        this.addEventListener('click', this.#boundOnClick, true);
    }
    /**
     * Perfer using the .data= setter instead of setting the individual properties
     * for increased type-safety.
     */
    set data(data) {
        this.#props.variant = data.variant;
        this.#props.iconUrl = data.iconUrl;
        this.#props.size = data.size || "MEDIUM" /* MEDIUM */;
        this.#props.active = Boolean(data.active);
        this.#props.spinner = Boolean(data.spinner);
        this.#props.type = data.type || 'button';
        this.#setDisabledProperty(data.disabled || false);
        this.#props.title = data.title;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    set iconUrl(iconUrl) {
        this.#props.iconUrl = iconUrl;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    set variant(variant) {
        this.#props.variant = variant;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    set size(size) {
        this.#props.size = size;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    set type(type) {
        this.#props.type = type;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    set title(title) {
        this.#props.title = title;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    set disabled(disabled) {
        this.#setDisabledProperty(disabled);
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    set active(active) {
        this.#props.active = active;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    set spinner(spinner) {
        this.#props.spinner = spinner;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    #setDisabledProperty(disabled) {
        this.#props.disabled = disabled;
        this.toggleAttribute('disabled', disabled);
    }
    focus() {
        this.#shadow.querySelector('button')?.focus();
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [buttonStyles];
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    #onClick(event) {
        if (this.#props.disabled) {
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        if (this.form && this.#props.type === 'submit') {
            event.preventDefault();
            this.form.dispatchEvent(new SubmitEvent('submit', {
                submitter: this,
            }));
        }
        if (this.form && this.#props.type === 'reset') {
            event.preventDefault();
            this.form.reset();
        }
    }
    #onSlotChange(event) {
        const slot = event.target;
        const nodes = slot?.assignedNodes();
        this.#isEmpty = !nodes || !Boolean(nodes.length);
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    #render() {
        if (!this.#props.variant) {
            throw new Error('Button requires a variant to be defined');
        }
        if (this.#props.variant === "toolbar" /* TOOLBAR */) {
            if (!this.#props.iconUrl) {
                throw new Error('Toolbar button requires an icon');
            }
            if (!this.#isEmpty) {
                throw new Error('Tooblar button does not accept children');
            }
        }
        if (this.#props.variant === "round" /* ROUND */) {
            if (!this.#props.iconUrl) {
                throw new Error('Round button requires an icon');
            }
            if (!this.#isEmpty) {
                throw new Error('Round button does not accept children');
            }
        }
        const classes = {
            primary: this.#props.variant === "primary" /* PRIMARY */,
            secondary: this.#props.variant === "secondary" /* SECONDARY */,
            toolbar: this.#props.variant === "toolbar" /* TOOLBAR */,
            round: this.#props.variant === "round" /* ROUND */,
            'text-with-icon': Boolean(this.#props.iconUrl) && !this.#isEmpty,
            'only-icon': Boolean(this.#props.iconUrl) && this.#isEmpty,
            small: Boolean(this.#props.size === "SMALL" /* SMALL */),
            active: this.#props.active,
        };
        const spinnerClasses = {
            primary: this.#props.variant === "primary" /* PRIMARY */,
            secondary: this.#props.variant === "secondary" /* SECONDARY */,
            disabled: Boolean(this.#props.disabled),
            'spinner-component': true,
        };
        // clang-format off
        LitHtml.render(LitHtml.html `
        <button title=${LitHtml.Directives.ifDefined(this.#props.title)} .disabled=${this.#props.disabled} class=${LitHtml.Directives.classMap(classes)}>
          ${this.#props.iconUrl ? LitHtml.html `<${IconButton.Icon.Icon.litTagName}
            .data=${{
            iconPath: this.#props.iconUrl,
            color: 'var(--color-background)',
        }}
          >
          </${IconButton.Icon.Icon.litTagName}>` : ''}
          ${this.#props.spinner ? LitHtml.html `<span class=${LitHtml.Directives.classMap(spinnerClasses)}></span>` : ''}
          <slot @slotchange=${this.#onSlotChange}></slot>
        </button>
      `, this.#shadow, { host: this });
        // clang-format on
    }
    // Based on https://web.dev/more-capable-form-controls/ to make custom elements form-friendly.
    // Form controls usually expose a "value" property.
    get value() {
        return this.#props.value || '';
    }
    set value(value) {
        this.#props.value = value;
    }
    // The following properties and methods aren't strictly required,
    // but browser-level form controls provide them. Providing them helps
    // ensure consistency with browser-provided controls.
    get form() {
        return this.#internals.form;
    }
    get name() {
        return this.getAttribute('name');
    }
    get type() {
        return this.#props.type;
    }
    get validity() {
        return this.#internals.validity;
    }
    get validationMessage() {
        return this.#internals.validationMessage;
    }
    get willValidate() {
        return this.#internals.willValidate;
    }
    checkValidity() {
        return this.#internals.checkValidity();
    }
    reportValidity() {
        return this.#internals.reportValidity();
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-button', Button);
//# sourceMappingURL=Button.js.map