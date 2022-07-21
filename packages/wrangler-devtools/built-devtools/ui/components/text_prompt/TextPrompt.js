// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as ComponentHelpers from '../../components/helpers/helpers.js';
import * as LitHtml from '../../lit-html/lit-html.js';
import textPromptStyles from './textPrompt.css.js';
export class PromptInputEvent extends Event {
    static eventName = 'promptinputchanged';
    data;
    constructor(value) {
        super(PromptInputEvent.eventName);
        this.data = value;
    }
}
export class TextPrompt extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-text-prompt`;
    #shadow = this.attachShadow({ mode: 'open' });
    #ariaLabelText = '';
    #prefixText = '';
    #suggestionText = '';
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [textPromptStyles];
    }
    set data(data) {
        this.#ariaLabelText = data.ariaLabel;
        this.#prefixText = data.prefix;
        this.#suggestionText = data.suggestion;
        this.#render();
    }
    get data() {
        return {
            ariaLabel: this.#ariaLabelText,
            prefix: this.#prefixText,
            suggestion: this.#suggestionText,
        };
    }
    focus() {
        this.#input().focus();
    }
    #input() {
        const inputElement = this.#shadow.querySelector('.input');
        if (!inputElement) {
            throw new Error('Expected an input element!');
        }
        return inputElement;
    }
    moveCaretToEndOfInput() {
        this.setSelectedRange(this.#text().length, this.#text().length);
    }
    onInput() {
        this.#suggestion().value = this.#text();
        this.dispatchEvent(new PromptInputEvent(this.#text().trim()));
    }
    onKeyDown(event) {
        if (event.key === Platform.KeyboardUtilities.ENTER_KEY) {
            event.preventDefault();
        }
    }
    setSelectedRange(startIndex, endIndex) {
        if (startIndex < 0) {
            throw new RangeError('Selected range start must be a nonnegative integer');
        }
        const textContentLength = this.#text().length;
        if (endIndex > textContentLength) {
            endIndex = textContentLength;
        }
        if (endIndex < startIndex) {
            endIndex = startIndex;
        }
        this.#input().setSelectionRange(startIndex, endIndex);
    }
    setPrefix(prefix) {
        this.#prefixText = prefix;
        this.#render();
    }
    setSuggestion(suggestion) {
        this.#suggestionText = suggestion;
        this.#suggestion().value += this.#suggestionText;
        this.#render();
    }
    setText(text) {
        this.#input().value = text;
        this.#suggestion().value = this.#text();
        if (this.#input().hasFocus()) {
            this.moveCaretToEndOfInput();
            this.#input().scrollIntoView();
        }
    }
    #suggestion() {
        const suggestionElement = this.#shadow.querySelector('.suggestion');
        if (!suggestionElement) {
            throw new Error('Expected an suggestion element!');
        }
        return suggestionElement;
    }
    #text() {
        return this.#input().value || '';
    }
    #render() {
        const output = LitHtml.html `
      <span class="prefix">${this.#prefixText} </span>
      <span class="text-prompt-input"><input class="input" aria-label=${this.#ariaLabelText} spellcheck="false" @input=${this.onInput} @keydown=${this.onKeyDown}/><input class="suggestion" aria-label=${this.#ariaLabelText + ' Suggestion'}></span>`;
        LitHtml.render(output, this.#shadow, { host: this });
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-text-prompt', TextPrompt);
//# sourceMappingURL=TextPrompt.js.map