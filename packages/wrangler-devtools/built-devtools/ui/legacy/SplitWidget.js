/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as ARIAUtils from './ARIAUtils.js';
import { Constraints } from './Geometry.js';
import { Events as ResizerWidgetEvents, SimpleResizerWidget } from './ResizerWidget.js';
import { ToolbarButton } from './Toolbar.js';
import { Widget } from './Widget.js';
import { ZoomManager } from './ZoomManager.js';
import splitWidgetStyles from './splitWidget.css.legacy.js';
export class SplitWidget extends Common.ObjectWrapper.eventMixin(Widget) {
    sidebarElementInternal;
    mainElement;
    resizerElementInternal;
    resizerElementSize;
    resizerWidget;
    defaultSidebarWidth;
    defaultSidebarHeight;
    constraintsInDip;
    resizeStartSizeDIP;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setting;
    totalSizeCSS;
    totalSizeOtherDimensionCSS;
    mainWidgetInternal;
    sidebarWidgetInternal;
    animationFrameHandle;
    animationCallback;
    showSidebarButtonTitle;
    hideSidebarButtonTitle;
    shownSidebarString;
    hiddenSidebarString;
    showHideSidebarButton;
    isVerticalInternal;
    sidebarMinimized;
    detaching;
    sidebarSizeDIP;
    savedSidebarSizeDIP;
    secondIsSidebar;
    shouldSaveShowMode;
    savedVerticalMainSize;
    savedHorizontalMainSize;
    showModeInternal;
    savedShowMode;
    constructor(isVertical, secondIsSidebar, settingName, defaultSidebarWidth, defaultSidebarHeight, constraintsInDip) {
        super(true);
        this.element.classList.add('split-widget');
        this.registerRequiredCSS(splitWidgetStyles);
        this.contentElement.classList.add('shadow-split-widget');
        this.sidebarElementInternal =
            this.contentElement.createChild('div', 'shadow-split-widget-contents shadow-split-widget-sidebar vbox');
        this.mainElement =
            this.contentElement.createChild('div', 'shadow-split-widget-contents shadow-split-widget-main vbox');
        this.mainElement.createChild('slot').name = 'insertion-point-main';
        this.sidebarElementInternal.createChild('slot').name = 'insertion-point-sidebar';
        this.resizerElementInternal = this.contentElement.createChild('div', 'shadow-split-widget-resizer');
        this.resizerElementSize = null;
        this.resizerWidget = new SimpleResizerWidget();
        this.resizerWidget.setEnabled(true);
        this.resizerWidget.addEventListener(ResizerWidgetEvents.ResizeStart, this.onResizeStart, this);
        this.resizerWidget.addEventListener(ResizerWidgetEvents.ResizeUpdatePosition, this.onResizeUpdate, this);
        this.resizerWidget.addEventListener(ResizerWidgetEvents.ResizeEnd, this.onResizeEnd, this);
        this.defaultSidebarWidth = defaultSidebarWidth || 200;
        this.defaultSidebarHeight = defaultSidebarHeight || this.defaultSidebarWidth;
        this.constraintsInDip = Boolean(constraintsInDip);
        this.resizeStartSizeDIP = 0;
        this.setting = settingName ? Common.Settings.Settings.instance().createSetting(settingName, {}) : null;
        this.totalSizeCSS = 0;
        this.totalSizeOtherDimensionCSS = 0;
        this.mainWidgetInternal = null;
        this.sidebarWidgetInternal = null;
        this.animationFrameHandle = 0;
        this.animationCallback = null;
        this.showSidebarButtonTitle = Common.UIString.LocalizedEmptyString;
        this.hideSidebarButtonTitle = Common.UIString.LocalizedEmptyString;
        this.shownSidebarString = Common.UIString.LocalizedEmptyString;
        this.hiddenSidebarString = Common.UIString.LocalizedEmptyString;
        this.showHideSidebarButton = null;
        this.isVerticalInternal = false;
        this.sidebarMinimized = false;
        this.detaching = false;
        this.sidebarSizeDIP = -1;
        this.savedSidebarSizeDIP = this.sidebarSizeDIP;
        this.secondIsSidebar = false;
        this.shouldSaveShowMode = false;
        this.savedVerticalMainSize = null;
        this.savedHorizontalMainSize = null;
        this.setSecondIsSidebar(secondIsSidebar);
        this.innerSetVertical(isVertical);
        this.showModeInternal = ShowMode.Both;
        this.savedShowMode = this.showModeInternal;
        // Should be called after isVertical has the right value.
        this.installResizer(this.resizerElementInternal);
    }
    isVertical() {
        return this.isVerticalInternal;
    }
    setVertical(isVertical) {
        if (this.isVerticalInternal === isVertical) {
            return;
        }
        this.innerSetVertical(isVertical);
        if (this.isShowing()) {
            this.updateLayout();
        }
    }
    innerSetVertical(isVertical) {
        this.contentElement.classList.toggle('vbox', !isVertical);
        this.contentElement.classList.toggle('hbox', isVertical);
        this.isVerticalInternal = isVertical;
        this.resizerElementSize = null;
        this.sidebarSizeDIP = -1;
        this.restoreSidebarSizeFromSettings();
        if (this.shouldSaveShowMode) {
            this.restoreAndApplyShowModeFromSettings();
        }
        this.updateShowHideSidebarButton();
        // FIXME: reverse SplitWidget.isVertical meaning.
        this.resizerWidget.setVertical(!isVertical);
        this.invalidateConstraints();
    }
    updateLayout(animate) {
        this.totalSizeCSS = 0; // Lazy update.
        this.totalSizeOtherDimensionCSS = 0;
        // Remove properties that might affect total size calculation.
        this.mainElement.style.removeProperty('width');
        this.mainElement.style.removeProperty('height');
        this.sidebarElementInternal.style.removeProperty('width');
        this.sidebarElementInternal.style.removeProperty('height');
        this.innerSetSidebarSizeDIP(this.preferredSidebarSizeDIP(), Boolean(animate));
    }
    setMainWidget(widget) {
        if (this.mainWidgetInternal === widget) {
            return;
        }
        this.suspendInvalidations();
        if (this.mainWidgetInternal) {
            this.mainWidgetInternal.detach();
        }
        this.mainWidgetInternal = widget;
        if (widget) {
            widget.element.slot = 'insertion-point-main';
            if (this.showModeInternal === ShowMode.OnlyMain || this.showModeInternal === ShowMode.Both) {
                widget.show(this.element);
            }
        }
        this.resumeInvalidations();
    }
    setSidebarWidget(widget) {
        if (this.sidebarWidgetInternal === widget) {
            return;
        }
        this.suspendInvalidations();
        if (this.sidebarWidgetInternal) {
            this.sidebarWidgetInternal.detach();
        }
        this.sidebarWidgetInternal = widget;
        if (widget) {
            widget.element.slot = 'insertion-point-sidebar';
            if (this.showModeInternal === ShowMode.OnlySidebar || this.showModeInternal === ShowMode.Both) {
                widget.show(this.element);
            }
        }
        this.resumeInvalidations();
    }
    mainWidget() {
        return this.mainWidgetInternal;
    }
    sidebarWidget() {
        return this.sidebarWidgetInternal;
    }
    sidebarElement() {
        return this.sidebarElementInternal;
    }
    childWasDetached(widget) {
        if (this.detaching) {
            return;
        }
        if (this.mainWidgetInternal === widget) {
            this.mainWidgetInternal = null;
        }
        if (this.sidebarWidgetInternal === widget) {
            this.sidebarWidgetInternal = null;
        }
        this.invalidateConstraints();
    }
    isSidebarSecond() {
        return this.secondIsSidebar;
    }
    enableShowModeSaving() {
        this.shouldSaveShowMode = true;
        this.restoreAndApplyShowModeFromSettings();
    }
    showMode() {
        return this.showModeInternal;
    }
    setSecondIsSidebar(secondIsSidebar) {
        if (secondIsSidebar === this.secondIsSidebar) {
            return;
        }
        this.secondIsSidebar = secondIsSidebar;
        if (!this.mainWidgetInternal || !this.mainWidgetInternal.shouldHideOnDetach()) {
            if (secondIsSidebar) {
                this.contentElement.insertBefore(this.mainElement, this.sidebarElementInternal);
            }
            else {
                this.contentElement.insertBefore(this.mainElement, this.resizerElementInternal);
            }
        }
        else if (!this.sidebarWidgetInternal || !this.sidebarWidgetInternal.shouldHideOnDetach()) {
            if (secondIsSidebar) {
                this.contentElement.insertBefore(this.sidebarElementInternal, this.resizerElementInternal);
            }
            else {
                this.contentElement.insertBefore(this.sidebarElementInternal, this.mainElement);
            }
        }
        else {
            console.error('Could not swap split widget side. Both children widgets contain iframes.');
            this.secondIsSidebar = !secondIsSidebar;
        }
    }
    sidebarSide() {
        if (this.showModeInternal !== ShowMode.Both) {
            return null;
        }
        return this.isVerticalInternal ? (this.secondIsSidebar ? 'right' : 'left') :
            (this.secondIsSidebar ? 'bottom' : 'top');
    }
    resizerElement() {
        return this.resizerElementInternal;
    }
    hideMain(animate) {
        this.showOnly(this.sidebarWidgetInternal, this.mainWidgetInternal, this.sidebarElementInternal, this.mainElement, animate);
        this.updateShowMode(ShowMode.OnlySidebar);
    }
    hideSidebar(animate) {
        this.showOnly(this.mainWidgetInternal, this.sidebarWidgetInternal, this.mainElement, this.sidebarElementInternal, animate);
        this.updateShowMode(ShowMode.OnlyMain);
    }
    setSidebarMinimized(minimized) {
        this.sidebarMinimized = minimized;
        this.invalidateConstraints();
    }
    isSidebarMinimized() {
        return this.sidebarMinimized;
    }
    showOnly(sideToShow, sideToHide, shadowToShow, shadowToHide, animate) {
        this.cancelAnimation();
        function callback() {
            if (sideToShow) {
                // Make sure main is first in the children list.
                if (sideToShow === this.mainWidgetInternal) {
                    this.mainWidgetInternal.show(this.element, this.sidebarWidgetInternal ? this.sidebarWidgetInternal.element : null);
                }
                else if (this.sidebarWidgetInternal) {
                    this.sidebarWidgetInternal.show(this.element);
                }
            }
            if (sideToHide) {
                this.detaching = true;
                sideToHide.detach();
                this.detaching = false;
            }
            this.resizerElementInternal.classList.add('hidden');
            shadowToShow.classList.remove('hidden');
            shadowToShow.classList.add('maximized');
            shadowToHide.classList.add('hidden');
            shadowToHide.classList.remove('maximized');
            this.removeAllLayoutProperties();
            this.doResize();
            this.showFinishedForTest();
        }
        if (animate) {
            this.animate(true, callback.bind(this));
        }
        else {
            callback.call(this);
        }
        this.sidebarSizeDIP = -1;
        this.setResizable(false);
    }
    showFinishedForTest() {
        // This method is sniffed in tests.
    }
    removeAllLayoutProperties() {
        this.sidebarElementInternal.style.removeProperty('flexBasis');
        this.mainElement.style.removeProperty('width');
        this.mainElement.style.removeProperty('height');
        this.sidebarElementInternal.style.removeProperty('width');
        this.sidebarElementInternal.style.removeProperty('height');
        this.resizerElementInternal.style.removeProperty('left');
        this.resizerElementInternal.style.removeProperty('right');
        this.resizerElementInternal.style.removeProperty('top');
        this.resizerElementInternal.style.removeProperty('bottom');
        this.resizerElementInternal.style.removeProperty('margin-left');
        this.resizerElementInternal.style.removeProperty('margin-right');
        this.resizerElementInternal.style.removeProperty('margin-top');
        this.resizerElementInternal.style.removeProperty('margin-bottom');
    }
    showBoth(animate) {
        if (this.showModeInternal === ShowMode.Both) {
            animate = false;
        }
        this.cancelAnimation();
        this.mainElement.classList.remove('maximized', 'hidden');
        this.sidebarElementInternal.classList.remove('maximized', 'hidden');
        this.resizerElementInternal.classList.remove('hidden');
        this.setResizable(true);
        // Make sure main is the first in the children list.
        this.suspendInvalidations();
        if (this.sidebarWidgetInternal) {
            this.sidebarWidgetInternal.show(this.element);
        }
        if (this.mainWidgetInternal) {
            this.mainWidgetInternal.show(this.element, this.sidebarWidgetInternal ? this.sidebarWidgetInternal.element : null);
        }
        this.resumeInvalidations();
        // Order widgets in DOM properly.
        this.setSecondIsSidebar(this.secondIsSidebar);
        this.sidebarSizeDIP = -1;
        this.updateShowMode(ShowMode.Both);
        this.updateLayout(animate);
    }
    setResizable(resizable) {
        this.resizerWidget.setEnabled(resizable);
    }
    isResizable() {
        return this.resizerWidget.isEnabled();
    }
    setSidebarSize(size) {
        const sizeDIP = ZoomManager.instance().cssToDIP(size);
        this.savedSidebarSizeDIP = sizeDIP;
        this.saveSetting();
        this.innerSetSidebarSizeDIP(sizeDIP, false, true);
    }
    sidebarSize() {
        const sizeDIP = Math.max(0, this.sidebarSizeDIP);
        return ZoomManager.instance().dipToCSS(sizeDIP);
    }
    /**
     * Returns total size in DIP.
     */
    totalSizeDIP() {
        if (!this.totalSizeCSS) {
            this.totalSizeCSS = this.isVerticalInternal ? this.contentElement.offsetWidth : this.contentElement.offsetHeight;
            this.totalSizeOtherDimensionCSS =
                this.isVerticalInternal ? this.contentElement.offsetHeight : this.contentElement.offsetWidth;
        }
        return ZoomManager.instance().cssToDIP(this.totalSizeCSS);
    }
    updateShowMode(showMode) {
        this.showModeInternal = showMode;
        this.saveShowModeToSettings();
        this.updateShowHideSidebarButton();
        this.dispatchEventToListeners(Events.ShowModeChanged, showMode);
        this.invalidateConstraints();
    }
    innerSetSidebarSizeDIP(sizeDIP, animate, userAction) {
        if (this.showModeInternal !== ShowMode.Both || !this.isShowing()) {
            return;
        }
        sizeDIP = this.applyConstraints(sizeDIP, userAction);
        if (this.sidebarSizeDIP === sizeDIP) {
            return;
        }
        if (!this.resizerElementSize) {
            this.resizerElementSize =
                this.isVerticalInternal ? this.resizerElementInternal.offsetWidth : this.resizerElementInternal.offsetHeight;
        }
        // Invalidate layout below.
        this.removeAllLayoutProperties();
        // this.totalSizeDIP is available below since we successfully applied constraints.
        const roundSizeCSS = Math.round(ZoomManager.instance().dipToCSS(sizeDIP));
        const sidebarSizeValue = roundSizeCSS + 'px';
        const mainSizeValue = (this.totalSizeCSS - roundSizeCSS) + 'px';
        this.sidebarElementInternal.style.flexBasis = sidebarSizeValue;
        // Make both sides relayout boundaries.
        if (this.isVerticalInternal) {
            this.sidebarElementInternal.style.width = sidebarSizeValue;
            this.mainElement.style.width = mainSizeValue;
            this.sidebarElementInternal.style.height = this.totalSizeOtherDimensionCSS + 'px';
            this.mainElement.style.height = this.totalSizeOtherDimensionCSS + 'px';
        }
        else {
            this.sidebarElementInternal.style.height = sidebarSizeValue;
            this.mainElement.style.height = mainSizeValue;
            this.sidebarElementInternal.style.width = this.totalSizeOtherDimensionCSS + 'px';
            this.mainElement.style.width = this.totalSizeOtherDimensionCSS + 'px';
        }
        // Position resizer.
        if (this.isVerticalInternal) {
            if (this.secondIsSidebar) {
                this.resizerElementInternal.style.right = sidebarSizeValue;
                this.resizerElementInternal.style.marginRight = -this.resizerElementSize / 2 + 'px';
            }
            else {
                this.resizerElementInternal.style.left = sidebarSizeValue;
                this.resizerElementInternal.style.marginLeft = -this.resizerElementSize / 2 + 'px';
            }
        }
        else {
            if (this.secondIsSidebar) {
                this.resizerElementInternal.style.bottom = sidebarSizeValue;
                this.resizerElementInternal.style.marginBottom = -this.resizerElementSize / 2 + 'px';
            }
            else {
                this.resizerElementInternal.style.top = sidebarSizeValue;
                this.resizerElementInternal.style.marginTop = -this.resizerElementSize / 2 + 'px';
            }
        }
        this.sidebarSizeDIP = sizeDIP;
        // Force layout.
        if (animate) {
            this.animate(false);
        }
        else {
            // No need to recalculate this.sidebarSizeDIP and this.totalSizeDIP again.
            this.doResize();
            this.dispatchEventToListeners(Events.SidebarSizeChanged, this.sidebarSize());
        }
    }
    animate(reverse, callback) {
        const animationTime = 50;
        this.animationCallback = callback || null;
        let animatedMarginPropertyName;
        if (this.isVerticalInternal) {
            animatedMarginPropertyName = this.secondIsSidebar ? 'margin-right' : 'margin-left';
        }
        else {
            animatedMarginPropertyName = this.secondIsSidebar ? 'margin-bottom' : 'margin-top';
        }
        const marginFrom = reverse ? '0' : '-' + ZoomManager.instance().dipToCSS(this.sidebarSizeDIP) + 'px';
        const marginTo = reverse ? '-' + ZoomManager.instance().dipToCSS(this.sidebarSizeDIP) + 'px' : '0';
        // This order of things is important.
        // 1. Resize main element early and force layout.
        this.contentElement.style.setProperty(animatedMarginPropertyName, marginFrom);
        if (!reverse) {
            suppressUnused(this.mainElement.offsetWidth);
            suppressUnused(this.sidebarElementInternal.offsetWidth);
        }
        // 2. Issue onresize to the sidebar element, its size won't change.
        if (!reverse && this.sidebarWidgetInternal) {
            this.sidebarWidgetInternal.doResize();
        }
        // 3. Configure and run animation
        this.contentElement.style.setProperty('transition', animatedMarginPropertyName + ' ' + animationTime + 'ms linear');
        const boundAnimationFrame = animationFrame.bind(this);
        let startTime = null;
        function animationFrame() {
            this.animationFrameHandle = 0;
            if (!startTime) {
                // Kick animation on first frame.
                this.contentElement.style.setProperty(animatedMarginPropertyName, marginTo);
                startTime = window.performance.now();
            }
            else if (window.performance.now() < startTime + animationTime) {
                // Process regular animation frame.
                if (this.mainWidgetInternal) {
                    this.mainWidgetInternal.doResize();
                }
            }
            else {
                // Complete animation.
                this.cancelAnimation();
                if (this.mainWidgetInternal) {
                    this.mainWidgetInternal.doResize();
                }
                this.dispatchEventToListeners(Events.SidebarSizeChanged, this.sidebarSize());
                return;
            }
            this.animationFrameHandle = this.contentElement.window().requestAnimationFrame(boundAnimationFrame);
        }
        this.animationFrameHandle = this.contentElement.window().requestAnimationFrame(boundAnimationFrame);
    }
    cancelAnimation() {
        this.contentElement.style.removeProperty('margin-top');
        this.contentElement.style.removeProperty('margin-right');
        this.contentElement.style.removeProperty('margin-bottom');
        this.contentElement.style.removeProperty('margin-left');
        this.contentElement.style.removeProperty('transition');
        if (this.animationFrameHandle) {
            this.contentElement.window().cancelAnimationFrame(this.animationFrameHandle);
            this.animationFrameHandle = 0;
        }
        if (this.animationCallback) {
            this.animationCallback();
            this.animationCallback = null;
        }
    }
    applyConstraints(sidebarSize, userAction) {
        const totalSize = this.totalSizeDIP();
        const zoomFactor = this.constraintsInDip ? 1 : ZoomManager.instance().zoomFactor();
        let constraints = this.sidebarWidgetInternal ? this.sidebarWidgetInternal.constraints() : new Constraints();
        let minSidebarSize = this.isVertical() ? constraints.minimum.width : constraints.minimum.height;
        if (!minSidebarSize) {
            minSidebarSize = MinPadding;
        }
        minSidebarSize *= zoomFactor;
        if (this.sidebarMinimized) {
            sidebarSize = minSidebarSize;
        }
        let preferredSidebarSize = this.isVertical() ? constraints.preferred.width : constraints.preferred.height;
        if (!preferredSidebarSize) {
            preferredSidebarSize = MinPadding;
        }
        preferredSidebarSize *= zoomFactor;
        // Allow sidebar to be less than preferred by explicit user action.
        if (sidebarSize < preferredSidebarSize) {
            preferredSidebarSize = Math.max(sidebarSize, minSidebarSize);
        }
        preferredSidebarSize += zoomFactor; // 1 css pixel for splitter border.
        constraints = this.mainWidgetInternal ? this.mainWidgetInternal.constraints() : new Constraints();
        let minMainSize = this.isVertical() ? constraints.minimum.width : constraints.minimum.height;
        if (!minMainSize) {
            minMainSize = MinPadding;
        }
        minMainSize *= zoomFactor;
        let preferredMainSize = this.isVertical() ? constraints.preferred.width : constraints.preferred.height;
        if (!preferredMainSize) {
            preferredMainSize = MinPadding;
        }
        preferredMainSize *= zoomFactor;
        const savedMainSize = this.isVertical() ? this.savedVerticalMainSize : this.savedHorizontalMainSize;
        if (savedMainSize !== null) {
            preferredMainSize = Math.min(preferredMainSize, savedMainSize * zoomFactor);
        }
        if (userAction) {
            preferredMainSize = minMainSize;
        }
        // Enough space for preferred.
        const totalPreferred = preferredMainSize + preferredSidebarSize;
        if (totalPreferred <= totalSize) {
            return Platform.NumberUtilities.clamp(sidebarSize, preferredSidebarSize, totalSize - preferredMainSize);
        }
        // Enough space for minimum.
        if (minMainSize + minSidebarSize <= totalSize) {
            const delta = totalPreferred - totalSize;
            const sidebarDelta = delta * preferredSidebarSize / totalPreferred;
            sidebarSize = preferredSidebarSize - sidebarDelta;
            return Platform.NumberUtilities.clamp(sidebarSize, minSidebarSize, totalSize - minMainSize);
        }
        // Not enough space even for minimum sizes.
        return Math.max(0, totalSize - minMainSize);
    }
    wasShown() {
        this.forceUpdateLayout();
        ZoomManager.instance().addEventListener("ZoomChanged" /* ZoomChanged */, this.onZoomChanged, this);
    }
    willHide() {
        ZoomManager.instance().removeEventListener("ZoomChanged" /* ZoomChanged */, this.onZoomChanged, this);
    }
    onResize() {
        this.updateLayout();
    }
    onLayout() {
        this.updateLayout();
    }
    calculateConstraints() {
        if (this.showModeInternal === ShowMode.OnlyMain) {
            return this.mainWidgetInternal ? this.mainWidgetInternal.constraints() : new Constraints();
        }
        if (this.showModeInternal === ShowMode.OnlySidebar) {
            return this.sidebarWidgetInternal ? this.sidebarWidgetInternal.constraints() : new Constraints();
        }
        let mainConstraints = this.mainWidgetInternal ? this.mainWidgetInternal.constraints() : new Constraints();
        let sidebarConstraints = this.sidebarWidgetInternal ? this.sidebarWidgetInternal.constraints() : new Constraints();
        const min = MinPadding;
        if (this.isVerticalInternal) {
            mainConstraints = mainConstraints.widthToMax(min).addWidth(1); // 1 for splitter
            sidebarConstraints = sidebarConstraints.widthToMax(min);
            return mainConstraints.addWidth(sidebarConstraints).heightToMax(sidebarConstraints);
        }
        mainConstraints = mainConstraints.heightToMax(min).addHeight(1); // 1 for splitter
        sidebarConstraints = sidebarConstraints.heightToMax(min);
        return mainConstraints.widthToMax(sidebarConstraints).addHeight(sidebarConstraints);
    }
    onResizeStart() {
        this.resizeStartSizeDIP = this.sidebarSizeDIP;
    }
    onResizeUpdate(event) {
        const offset = event.data.currentPosition - event.data.startPosition;
        const offsetDIP = ZoomManager.instance().cssToDIP(offset);
        const newSizeDIP = this.secondIsSidebar ? this.resizeStartSizeDIP - offsetDIP : this.resizeStartSizeDIP + offsetDIP;
        const constrainedSizeDIP = this.applyConstraints(newSizeDIP, true);
        this.savedSidebarSizeDIP = constrainedSizeDIP;
        this.saveSetting();
        this.innerSetSidebarSizeDIP(constrainedSizeDIP, false, true);
        if (this.isVertical()) {
            this.savedVerticalMainSize = this.totalSizeDIP() - this.sidebarSizeDIP;
        }
        else {
            this.savedHorizontalMainSize = this.totalSizeDIP() - this.sidebarSizeDIP;
        }
    }
    onResizeEnd() {
        this.resizeStartSizeDIP = 0;
    }
    hideDefaultResizer(noSplitter) {
        this.uninstallResizer(this.resizerElementInternal);
        this.sidebarElementInternal.classList.toggle('no-default-splitter', Boolean(noSplitter));
    }
    installResizer(resizerElement) {
        this.resizerWidget.addElement(resizerElement);
    }
    uninstallResizer(resizerElement) {
        this.resizerWidget.removeElement(resizerElement);
    }
    hasCustomResizer() {
        const elements = this.resizerWidget.elements();
        return elements.length > 1 || (elements.length === 1 && elements[0] !== this.resizerElementInternal);
    }
    toggleResizer(resizer, on) {
        if (on) {
            this.installResizer(resizer);
        }
        else {
            this.uninstallResizer(resizer);
        }
    }
    settingForOrientation() {
        const state = this.setting ? this.setting.get() : {};
        return this.isVerticalInternal ? state.vertical : state.horizontal;
    }
    preferredSidebarSizeDIP() {
        let size = this.savedSidebarSizeDIP;
        if (!size) {
            size = this.isVerticalInternal ? this.defaultSidebarWidth : this.defaultSidebarHeight;
            // If we have default value in percents, calculate it on first use.
            if (0 < size && size < 1) {
                size *= this.totalSizeDIP();
            }
        }
        return size;
    }
    restoreSidebarSizeFromSettings() {
        const settingForOrientation = this.settingForOrientation();
        this.savedSidebarSizeDIP = settingForOrientation ? settingForOrientation.size : 0;
    }
    restoreAndApplyShowModeFromSettings() {
        const orientationState = this.settingForOrientation();
        this.savedShowMode =
            orientationState && orientationState.showMode ? orientationState.showMode : this.showModeInternal;
        this.showModeInternal = this.savedShowMode;
        switch (this.savedShowMode) {
            case ShowMode.Both:
                this.showBoth();
                break;
            case ShowMode.OnlyMain:
                this.hideSidebar();
                break;
            case ShowMode.OnlySidebar:
                this.hideMain();
                break;
        }
    }
    saveShowModeToSettings() {
        this.savedShowMode = this.showModeInternal;
        this.saveSetting();
    }
    saveSetting() {
        if (!this.setting) {
            return;
        }
        const state = this.setting.get();
        const orientationState = (this.isVerticalInternal ? state.vertical : state.horizontal) || {};
        orientationState.size = this.savedSidebarSizeDIP;
        if (this.shouldSaveShowMode) {
            orientationState.showMode = this.savedShowMode;
        }
        if (this.isVerticalInternal) {
            state.vertical = orientationState;
        }
        else {
            state.horizontal = orientationState;
        }
        this.setting.set(state);
    }
    forceUpdateLayout() {
        // Force layout even if sidebar size does not change.
        this.sidebarSizeDIP = -1;
        this.updateLayout();
    }
    onZoomChanged() {
        this.forceUpdateLayout();
    }
    createShowHideSidebarButton(showTitle, hideTitle, shownString, hiddenString) {
        this.showSidebarButtonTitle = showTitle;
        this.hideSidebarButtonTitle = hideTitle;
        this.shownSidebarString = shownString;
        this.hiddenSidebarString = hiddenString;
        this.showHideSidebarButton = new ToolbarButton('', '');
        this.showHideSidebarButton.addEventListener(ToolbarButton.Events.Click, buttonClicked, this);
        this.updateShowHideSidebarButton();
        function buttonClicked() {
            this.toggleSidebar();
        }
        return this.showHideSidebarButton;
    }
    toggleSidebar() {
        if (this.showModeInternal !== ShowMode.Both) {
            this.showBoth(true);
            ARIAUtils.alert(this.shownSidebarString);
        }
        else {
            this.hideSidebar(true);
            ARIAUtils.alert(this.hiddenSidebarString);
        }
    }
    updateShowHideSidebarButton() {
        if (!this.showHideSidebarButton) {
            return;
        }
        const sidebarHidden = this.showModeInternal === ShowMode.OnlyMain;
        let glyph = '';
        if (sidebarHidden) {
            glyph = this.isVertical() ?
                (this.isSidebarSecond() ? 'largeicon-show-right-sidebar' : 'largeicon-show-left-sidebar') :
                (this.isSidebarSecond() ? 'largeicon-show-bottom-sidebar' : 'largeicon-show-top-sidebar');
        }
        else {
            glyph = this.isVertical() ?
                (this.isSidebarSecond() ? 'largeicon-hide-right-sidebar' : 'largeicon-hide-left-sidebar') :
                (this.isSidebarSecond() ? 'largeicon-hide-bottom-sidebar' : 'largeicon-hide-top-sidebar');
        }
        this.showHideSidebarButton.setGlyph(glyph);
        this.showHideSidebarButton.setTitle(sidebarHidden ? this.showSidebarButtonTitle : this.hideSidebarButtonTitle);
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var ShowMode;
(function (ShowMode) {
    ShowMode["Both"] = "Both";
    ShowMode["OnlyMain"] = "OnlyMain";
    ShowMode["OnlySidebar"] = "OnlySidebar";
})(ShowMode || (ShowMode = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["SidebarSizeChanged"] = "SidebarSizeChanged";
    Events["ShowModeChanged"] = "ShowModeChanged";
})(Events || (Events = {}));
const MinPadding = 20;
const suppressUnused = function (_value) { };
//# sourceMappingURL=SplitWidget.js.map