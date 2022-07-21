// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as LitHtml from '../../lit-html/lit-html.js';
import * as ComponentHelpers from '../helpers/helpers.js';
import { toHexString } from './LinearMemoryInspectorUtils.js';
import linearMemoryViewerStyles from './linearMemoryViewer.css.js';
const { render, html } = LitHtml;
export class ByteSelectedEvent extends Event {
    static eventName = 'byteselected';
    data;
    constructor(address) {
        super(ByteSelectedEvent.eventName);
        this.data = address;
    }
}
export class ResizeEvent extends Event {
    static eventName = 'resize';
    data;
    constructor(numBytesPerPage) {
        super(ResizeEvent.eventName);
        this.data = numBytesPerPage;
    }
}
const BYTE_GROUP_MARGIN = 8;
const BYTE_GROUP_SIZE = 4;
export class LinearMemoryViewer extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-linear-memory-inspector-viewer`;
    #shadow = this.attachShadow({ mode: 'open' });
    #resizeObserver = new ResizeObserver(() => this.#resize());
    #isObservingResize = false;
    #memory = new Uint8Array();
    #address = 0;
    #memoryOffset = 0;
    #highlightInfo;
    #numRows = 1;
    #numBytesInRow = BYTE_GROUP_SIZE;
    #focusOnByte = true;
    #lastKeyUpdateSent = undefined;
    set data(data) {
        if (data.address < data.memoryOffset || data.address > data.memoryOffset + data.memory.length || data.address < 0) {
            throw new Error('Address is out of bounds.');
        }
        if (data.memoryOffset < 0) {
            throw new Error('Memory offset has to be greater or equal to zero.');
        }
        this.#memory = data.memory;
        this.#address = data.address;
        this.#highlightInfo = data.highlightInfo;
        this.#memoryOffset = data.memoryOffset;
        this.#focusOnByte = data.focus;
        this.#update();
    }
    connectedCallback() {
        ComponentHelpers.SetCSSProperty.set(this, '--byte-group-margin', `${BYTE_GROUP_MARGIN}px`);
        this.#shadow.adoptedStyleSheets = [linearMemoryViewerStyles];
    }
    disconnectedCallback() {
        this.#isObservingResize = false;
        this.#resizeObserver.disconnect();
    }
    #update() {
        this.#updateDimensions();
        this.#render();
        this.#focusOnView();
        this.#engageResizeObserver();
    }
    #focusOnView() {
        if (this.#focusOnByte) {
            const view = this.#shadow.querySelector('.view');
            if (view) {
                view.focus();
            }
        }
    }
    #resize() {
        this.#update();
        this.dispatchEvent(new ResizeEvent(this.#numBytesInRow * this.#numRows));
    }
    /** Recomputes the number of rows and (byte) columns that fit into the current view. */
    #updateDimensions() {
        if (this.clientWidth === 0 || this.clientHeight === 0 || !this.shadowRoot) {
            this.#numBytesInRow = BYTE_GROUP_SIZE;
            this.#numRows = 1;
            return;
        }
        // We initially just plot one row with one byte group (here: byte group size of 4).
        // Depending on that initially plotted row we can determine how many rows and
        // bytes per row we can fit.
        // >    0000000 | b0 b1 b2 b4 | a0 a1 a2 a3    <
        //      ^-------^ ^-^           ^-^
        //          |     byteCellWidth textCellWidth
        //          |
        //     addressTextAndDividerWidth
        //  ^--^   +     ^----------------------------^
        //      widthToFill
        const firstByteCell = this.shadowRoot.querySelector('.byte-cell');
        const textCell = this.shadowRoot.querySelector('.text-cell');
        const divider = this.shadowRoot.querySelector('.divider');
        const rowElement = this.shadowRoot.querySelector('.row');
        const addressText = this.shadowRoot.querySelector('.address');
        if (!firstByteCell || !textCell || !divider || !rowElement || !addressText) {
            this.#numBytesInRow = BYTE_GROUP_SIZE;
            this.#numRows = 1;
            return;
        }
        // Calculate the width required for each (unsplittable) group of bytes.
        const byteCellWidth = firstByteCell.getBoundingClientRect().width;
        const textCellWidth = textCell.getBoundingClientRect().width;
        const groupWidth = BYTE_GROUP_SIZE * (byteCellWidth + textCellWidth) + BYTE_GROUP_MARGIN;
        // Calculate the width to fill.
        const dividerWidth = divider.getBoundingClientRect().width;
        const addressTextAndDividerWidth = firstByteCell.getBoundingClientRect().left - addressText.getBoundingClientRect().left;
        // this.clientWidth is rounded, while the other values are not. Subtract 1 to make
        // sure that we correctly calculate the widths.
        const widthToFill = this.clientWidth - 1 - addressTextAndDividerWidth - dividerWidth;
        if (widthToFill < groupWidth) {
            this.#numBytesInRow = BYTE_GROUP_SIZE;
            this.#numRows = 1;
            return;
        }
        this.#numBytesInRow = Math.floor(widthToFill / groupWidth) * BYTE_GROUP_SIZE;
        this.#numRows = Math.floor(this.clientHeight / rowElement.clientHeight);
    }
    #engageResizeObserver() {
        if (!this.#resizeObserver || this.#isObservingResize) {
            return;
        }
        this.#resizeObserver.observe(this);
        this.#isObservingResize = true;
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        render(html `
      <div class="view" tabindex="0" @keydown=${this.#onKeyDown}>
          ${this.#renderView()}
      </div>
      `, this.#shadow, { host: this });
    }
    #onKeyDown(event) {
        const keyboardEvent = event;
        let newAddress = undefined;
        if (keyboardEvent.code === 'ArrowUp') {
            newAddress = this.#address - this.#numBytesInRow;
        }
        else if (keyboardEvent.code === 'ArrowDown') {
            newAddress = this.#address + this.#numBytesInRow;
        }
        else if (keyboardEvent.code === 'ArrowLeft') {
            newAddress = this.#address - 1;
        }
        else if (keyboardEvent.code === 'ArrowRight') {
            newAddress = this.#address + 1;
        }
        else if (keyboardEvent.code === 'PageUp') {
            newAddress = this.#address - this.#numBytesInRow * this.#numRows;
        }
        else if (keyboardEvent.code === 'PageDown') {
            newAddress = this.#address + this.#numBytesInRow * this.#numRows;
        }
        if (newAddress !== undefined && newAddress !== this.#lastKeyUpdateSent) {
            this.#lastKeyUpdateSent = newAddress;
            this.dispatchEvent(new ByteSelectedEvent(newAddress));
        }
    }
    #renderView() {
        const itemTemplates = [];
        for (let i = 0; i < this.#numRows; ++i) {
            itemTemplates.push(this.#renderRow(i));
        }
        return html `${itemTemplates}`;
    }
    #renderRow(row) {
        const { startIndex, endIndex } = { startIndex: row * this.#numBytesInRow, endIndex: (row + 1) * this.#numBytesInRow };
        const classMap = {
            address: true,
            selected: Math.floor((this.#address - this.#memoryOffset) / this.#numBytesInRow) === row,
        };
        return html `
    <div class="row">
      <span class=${LitHtml.Directives.classMap(classMap)}>${toHexString({ number: startIndex + this.#memoryOffset, pad: 8, prefix: false })}</span>
      <span class="divider"></span>
      ${this.#renderByteValues(startIndex, endIndex)}
      <span class="divider"></span>
      ${this.#renderCharacterValues(startIndex, endIndex)}
    </div>
    `;
    }
    #renderByteValues(startIndex, endIndex) {
        const cells = [];
        for (let i = startIndex; i < endIndex; ++i) {
            const actualIndex = i + this.#memoryOffset;
            // Add margin after each group of bytes of size byteGroupSize.
            const addMargin = i !== startIndex && (i - startIndex) % BYTE_GROUP_SIZE === 0;
            const selected = i === this.#address - this.#memoryOffset;
            const shouldBeHighlighted = this.#shouldBeHighlighted(actualIndex);
            const classMap = {
                'cell': true,
                'byte-cell': true,
                'byte-group-margin': addMargin,
                selected,
                'highlight-area': shouldBeHighlighted,
            };
            const isSelectableCell = i < this.#memory.length;
            const byteValue = isSelectableCell ? html `${toHexString({ number: this.#memory[i], pad: 2, prefix: false })}` : '';
            const onSelectedByte = isSelectableCell ? this.#onSelectedByte.bind(this, actualIndex) : '';
            cells.push(html `<span class=${LitHtml.Directives.classMap(classMap)} @click=${onSelectedByte}>${byteValue}</span>`);
        }
        return html `${cells}`;
    }
    #renderCharacterValues(startIndex, endIndex) {
        const cells = [];
        for (let i = startIndex; i < endIndex; ++i) {
            const actualIndex = i + this.#memoryOffset;
            const shouldBeHighlighted = this.#shouldBeHighlighted(actualIndex);
            const classMap = {
                'cell': true,
                'text-cell': true,
                selected: this.#address - this.#memoryOffset === i,
                'highlight-area': shouldBeHighlighted,
            };
            const isSelectableCell = i < this.#memory.length;
            const value = isSelectableCell ? html `${this.#toAscii(this.#memory[i])}` : '';
            const onSelectedByte = isSelectableCell ? this.#onSelectedByte.bind(this, i + this.#memoryOffset) : '';
            cells.push(html `<span class=${LitHtml.Directives.classMap(classMap)} @click=${onSelectedByte}>${value}</span>`);
        }
        return html `${cells}`;
    }
    #toAscii(byte) {
        if (byte >= 20 && byte <= 0x7F) {
            return String.fromCharCode(byte);
        }
        return '.';
    }
    #onSelectedByte(index) {
        this.dispatchEvent(new ByteSelectedEvent(index));
    }
    #shouldBeHighlighted(index) {
        if (this.#highlightInfo === undefined) {
            return false;
        }
        return this.#highlightInfo.startAddress <= index
            && index < this.#highlightInfo.startAddress + this.#highlightInfo.size;
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-linear-memory-inspector-viewer', LinearMemoryViewer);
//# sourceMappingURL=LinearMemoryViewer.js.map