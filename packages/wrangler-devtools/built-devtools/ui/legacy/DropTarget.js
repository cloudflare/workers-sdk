// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import dropTargetStyles from './dropTarget.css.legacy.js';
import * as Utils from './utils/utils.js';
export class DropTarget {
    element;
    transferTypes;
    messageText;
    handleDrop;
    enabled;
    dragMaskElement;
    constructor(element, transferTypes, messageText, handleDrop) {
        element.addEventListener('dragenter', this.onDragEnter.bind(this), true);
        element.addEventListener('dragover', this.onDragOver.bind(this), true);
        this.element = element;
        this.transferTypes = transferTypes;
        this.messageText = messageText;
        this.handleDrop = handleDrop;
        this.enabled = true;
        this.dragMaskElement = null;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    onDragEnter(event) {
        if (this.enabled && this.hasMatchingType(event)) {
            event.consume(true);
        }
    }
    hasMatchingType(ev) {
        const event = ev;
        if (!event.dataTransfer) {
            return false;
        }
        for (const transferType of this.transferTypes) {
            const found = Array.from(event.dataTransfer.items).find(item => {
                return transferType.kind === item.kind && Boolean(transferType.type.exec(item.type));
            });
            if (found) {
                return true;
            }
        }
        return false;
    }
    onDragOver(ev) {
        const event = ev;
        if (!this.enabled || !this.hasMatchingType(event)) {
            return;
        }
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
        event.consume(true);
        if (this.dragMaskElement) {
            return;
        }
        this.dragMaskElement = this.element.createChild('div', '');
        const shadowRoot = Utils.createShadowRootWithCoreStyles(this.dragMaskElement, { cssFile: dropTargetStyles, delegatesFocus: undefined });
        shadowRoot.createChild('div', 'drop-target-message').textContent = this.messageText;
        this.dragMaskElement.addEventListener('drop', this.onDrop.bind(this), true);
        this.dragMaskElement.addEventListener('dragleave', this.onDragLeave.bind(this), true);
    }
    onDrop(ev) {
        const event = ev;
        event.consume(true);
        this.removeMask();
        if (this.enabled && event.dataTransfer) {
            this.handleDrop(event.dataTransfer);
        }
    }
    onDragLeave(event) {
        event.consume(true);
        this.removeMask();
    }
    removeMask() {
        if (this.dragMaskElement) {
            this.dragMaskElement.remove();
            this.dragMaskElement = null;
        }
    }
}
export const Type = {
    URI: { kind: 'string', type: /text\/uri-list/ },
    Folder: { kind: 'file', type: /$^/ },
    File: { kind: 'file', type: /.*/ },
    WebFile: { kind: 'file', type: /[\w]+/ },
    ImageFile: { kind: 'file', type: /image\/.*/ },
};
//# sourceMappingURL=DropTarget.js.map