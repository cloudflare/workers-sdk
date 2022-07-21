/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import { GlassPane } from './GlassPane.js';
import popoverStyles from './popover.css.legacy.js';
export class PopoverHelper {
    disableOnClick;
    hasPadding;
    getRequest;
    scheduledRequest;
    hidePopoverCallback;
    container;
    showTimeout;
    hideTimeout;
    hidePopoverTimer;
    showPopoverTimer;
    boundMouseDown;
    boundMouseMove;
    boundMouseOut;
    constructor(container, getRequest) {
        this.disableOnClick = false;
        this.hasPadding = false;
        this.getRequest = getRequest;
        this.scheduledRequest = null;
        this.hidePopoverCallback = null;
        this.container = container;
        this.showTimeout = 0;
        this.hideTimeout = 0;
        this.hidePopoverTimer = null;
        this.showPopoverTimer = null;
        this.boundMouseDown = this.mouseDown.bind(this);
        this.boundMouseMove = this.mouseMove.bind(this);
        this.boundMouseOut = this.mouseOut.bind(this);
        this.container.addEventListener('mousedown', this.boundMouseDown, false);
        this.container.addEventListener('mousemove', this.boundMouseMove, false);
        this.container.addEventListener('mouseout', this.boundMouseOut, false);
        this.setTimeout(1000);
    }
    setTimeout(showTimeout, hideTimeout) {
        this.showTimeout = showTimeout;
        this.hideTimeout = typeof hideTimeout === 'number' ? hideTimeout : showTimeout / 2;
    }
    setHasPadding(hasPadding) {
        this.hasPadding = hasPadding;
    }
    setDisableOnClick(disableOnClick) {
        this.disableOnClick = disableOnClick;
    }
    eventInScheduledContent(ev) {
        const event = ev;
        return this.scheduledRequest ? this.scheduledRequest.box.contains(event.clientX, event.clientY) : false;
    }
    mouseDown(event) {
        if (this.disableOnClick) {
            this.hidePopover();
            return;
        }
        if (this.eventInScheduledContent(event)) {
            return;
        }
        this.startHidePopoverTimer(0);
        this.stopShowPopoverTimer();
        this.startShowPopoverTimer(event, 0);
    }
    mouseMove(ev) {
        const event = ev;
        // Pretend that nothing has happened.
        if (this.eventInScheduledContent(event)) {
            return;
        }
        this.startHidePopoverTimer(this.hideTimeout);
        this.stopShowPopoverTimer();
        if (event.which && this.disableOnClick) {
            return;
        }
        this.startShowPopoverTimer(event, this.isPopoverVisible() ? this.showTimeout * 0.6 : this.showTimeout);
    }
    popoverMouseMove(_event) {
        this.stopHidePopoverTimer();
    }
    popoverMouseOut(popover, ev) {
        const event = ev;
        if (!popover.isShowing()) {
            return;
        }
        const node = event.relatedTarget;
        if (node && !node.isSelfOrDescendant(popover.contentElement)) {
            this.startHidePopoverTimer(this.hideTimeout);
        }
    }
    mouseOut(event) {
        if (!this.isPopoverVisible()) {
            return;
        }
        if (!this.eventInScheduledContent(event)) {
            this.startHidePopoverTimer(this.hideTimeout);
        }
    }
    startHidePopoverTimer(timeout) {
        // User has |timeout| ms to reach the popup.
        if (!this.hidePopoverCallback || this.hidePopoverTimer) {
            return;
        }
        this.hidePopoverTimer = window.setTimeout(() => {
            this.hidePopover();
            this.hidePopoverTimer = null;
        }, timeout);
    }
    startShowPopoverTimer(event, timeout) {
        this.scheduledRequest = this.getRequest.call(null, event);
        if (!this.scheduledRequest) {
            return;
        }
        this.showPopoverTimer = window.setTimeout(() => {
            this.showPopoverTimer = null;
            this.stopHidePopoverTimer();
            this.hidePopoverInternal();
            const document = (event.target.ownerDocument);
            this.showPopover(document);
        }, timeout);
    }
    stopShowPopoverTimer() {
        if (!this.showPopoverTimer) {
            return;
        }
        clearTimeout(this.showPopoverTimer);
        this.showPopoverTimer = null;
    }
    isPopoverVisible() {
        return Boolean(this.hidePopoverCallback);
    }
    hidePopover() {
        this.stopShowPopoverTimer();
        this.hidePopoverInternal();
    }
    hidePopoverInternal() {
        if (!this.hidePopoverCallback) {
            return;
        }
        this.hidePopoverCallback.call(null);
        this.hidePopoverCallback = null;
    }
    showPopover(document) {
        const popover = new GlassPane();
        popover.registerRequiredCSS(popoverStyles);
        popover.setSizeBehavior("MeasureContent" /* MeasureContent */);
        popover.setMarginBehavior("Arrow" /* Arrow */);
        const request = this.scheduledRequest;
        if (!request) {
            return;
        }
        void request.show.call(null, popover).then(success => {
            if (!success) {
                return;
            }
            if (this.scheduledRequest !== request) {
                if (request.hide) {
                    request.hide.call(null);
                }
                return;
            }
            // This should not happen, but we hide previous popover to be on the safe side.
            if (popoverHelperInstance) {
                console.error('One popover is already visible');
                popoverHelperInstance.hidePopover();
            }
            popoverHelperInstance = this;
            popover.contentElement.classList.toggle('has-padding', this.hasPadding);
            popover.contentElement.addEventListener('mousemove', this.popoverMouseMove.bind(this), true);
            popover.contentElement.addEventListener('mouseout', this.popoverMouseOut.bind(this, popover), true);
            popover.setContentAnchorBox(request.box);
            popover.show(document);
            this.hidePopoverCallback = () => {
                if (request.hide) {
                    request.hide.call(null);
                }
                popover.hide();
                popoverHelperInstance = null;
            };
        });
    }
    stopHidePopoverTimer() {
        if (!this.hidePopoverTimer) {
            return;
        }
        clearTimeout(this.hidePopoverTimer);
        this.hidePopoverTimer = null;
        // We know that we reached the popup, but we might have moved over other elements.
        // Discard pending command.
        this.stopShowPopoverTimer();
    }
    dispose() {
        this.container.removeEventListener('mousedown', this.boundMouseDown, false);
        this.container.removeEventListener('mousemove', this.boundMouseMove, false);
        this.container.removeEventListener('mouseout', this.boundMouseOut, false);
    }
}
let popoverHelperInstance = null;
//# sourceMappingURL=PopoverHelper.js.map