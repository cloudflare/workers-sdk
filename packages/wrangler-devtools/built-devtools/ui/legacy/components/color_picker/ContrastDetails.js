// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../../core/common/common.js';
import * as Host from '../../../../core/host/host.js';
import * as i18n from '../../../../core/i18n/i18n.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as Root from '../../../../core/root/root.js';
import * as UI from '../../legacy.js';
const UIStrings = {
    /**
    *@description Label for when no contrast information is available in the color picker
    */
    noContrastInformationAvailable: 'No contrast information available',
    /**
    *@description Text of a DOM element in Contrast Details of the Color Picker
    */
    contrastRatio: 'Contrast ratio',
    /**
    *@description Text to show more content
    */
    showMore: 'Show more',
    /**
    *@description Choose bg color text content in Contrast Details of the Color Picker
    */
    pickBackgroundColor: 'Pick background color',
    /**
    *@description Tooltip text that appears when hovering over largeicon eyedropper button in Contrast Details of the Color Picker
    */
    toggleBackgroundColorPicker: 'Toggle background color picker',
    /**
    *@description Text of a button in Contrast Details of the Color Picker
    *@example {rgba(0 0 0 / 100%) } PH1
    */
    useSuggestedColorStoFixLow: 'Use suggested color {PH1}to fix low contrast',
    /**
    *@description Label for the APCA contrast in Color Picker
    */
    apca: 'APCA',
    /**
    *@description Label aa text content in Contrast Details of the Color Picker
    */
    aa: 'AA',
    /**
    *@description Text that starts with a colon and includes a placeholder
    *@example {3.0} PH1
    */
    placeholderWithColon: ': {PH1}',
    /**
    *@description Label aaa text content in Contrast Details of the Color Picker
    */
    aaa: 'AAA',
    /**
    *@description Text to show less content
    */
    showLess: 'Show less',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/components/color_picker/ContrastDetails.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ContrastDetails extends Common.ObjectWrapper.ObjectWrapper {
    contrastInfo;
    elementInternal;
    toggleMainColorPicker;
    expandedChangedCallback;
    colorSelectedCallback;
    expandedInternal;
    passesAA;
    contrastUnknown;
    visibleInternal;
    noContrastInfoAvailable;
    contrastValueBubble;
    contrastValue;
    contrastValueBubbleIcons;
    expandButton;
    expandedDetails;
    contrastThresholds;
    contrastAA;
    contrastPassFailAA;
    contrastAAA;
    contrastPassFailAAA;
    contrastAPCA;
    contrastPassFailAPCA;
    chooseBgColor;
    bgColorPickerButton;
    bgColorPickedBound;
    bgColorSwatch;
    constructor(contrastInfo, contentElement, toggleMainColorPickerCallback, expandedChangedCallback, colorSelectedCallback) {
        super();
        this.contrastInfo = contrastInfo;
        this.elementInternal = contentElement.createChild('div', 'spectrum-contrast-details collapsed');
        this.toggleMainColorPicker = toggleMainColorPickerCallback;
        this.expandedChangedCallback = expandedChangedCallback;
        this.colorSelectedCallback = colorSelectedCallback;
        this.expandedInternal = false;
        this.passesAA = true;
        this.contrastUnknown = false;
        // This will not be visible if we don't get ContrastInfo,
        // e.g. for a non-font color property such as border-color.
        this.visibleInternal = false;
        // No contrast info message is created to show if it's not possible to provide the extended details.
        this.noContrastInfoAvailable = contentElement.createChild('div', 'no-contrast-info-available');
        this.noContrastInfoAvailable.textContent = i18nString(UIStrings.noContrastInformationAvailable);
        this.noContrastInfoAvailable.classList.add('hidden');
        const contrastValueRow = this.elementInternal.createChild('div');
        contrastValueRow.addEventListener('click', this.topRowClicked.bind(this));
        const contrastValueRowContents = contrastValueRow.createChild('div', 'container');
        UI.UIUtils.createTextChild(contrastValueRowContents, i18nString(UIStrings.contrastRatio));
        this.contrastValueBubble = contrastValueRowContents.createChild('span', 'contrast-details-value');
        this.contrastValue = this.contrastValueBubble.createChild('span');
        this.contrastValueBubbleIcons = [];
        this.contrastValueBubbleIcons.push(this.contrastValueBubble.appendChild(UI.Icon.Icon.create('smallicon-checkmark-square')));
        this.contrastValueBubbleIcons.push(this.contrastValueBubble.appendChild(UI.Icon.Icon.create('smallicon-checkmark-behind')));
        this.contrastValueBubbleIcons.push(this.contrastValueBubble.appendChild(UI.Icon.Icon.create('smallicon-no')));
        this.contrastValueBubbleIcons.forEach(button => button.addEventListener('click', (event) => {
            ContrastDetails.showHelp();
            event.consume(false);
        }));
        const expandToolbar = new UI.Toolbar.Toolbar('expand', contrastValueRowContents);
        this.expandButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.showMore), 'smallicon-expand-more');
        this.expandButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.expandButtonClicked.bind(this));
        UI.ARIAUtils.setExpanded(this.expandButton.element, false);
        expandToolbar.appendToolbarItem(this.expandButton);
        this.expandedDetails = this.elementInternal.createChild('div', 'expanded-details');
        UI.ARIAUtils.setControls(this.expandButton.element, this.expandedDetails);
        this.contrastThresholds = this.expandedDetails.createChild('div', 'contrast-thresholds');
        this.contrastAA = this.contrastThresholds.createChild('div', 'contrast-threshold');
        this.contrastPassFailAA = this.contrastAA.createChild('div', 'contrast-pass-fail');
        this.contrastAAA = this.contrastThresholds.createChild('div', 'contrast-threshold');
        this.contrastPassFailAAA = this.contrastAAA.createChild('div', 'contrast-pass-fail');
        this.contrastAPCA = this.contrastThresholds.createChild('div', 'contrast-threshold');
        this.contrastPassFailAPCA = this.contrastAPCA.createChild('div', 'contrast-pass-fail');
        this.chooseBgColor = this.expandedDetails.createChild('div', 'contrast-choose-bg-color');
        this.chooseBgColor.textContent = i18nString(UIStrings.pickBackgroundColor);
        const bgColorContainer = this.expandedDetails.createChild('div', 'background-color');
        const pickerToolbar = new UI.Toolbar.Toolbar('spectrum-eye-dropper', bgColorContainer);
        this.bgColorPickerButton =
            new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.toggleBackgroundColorPicker), 'largeicon-eyedropper');
        this.bgColorPickerButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.toggleBackgroundColorPickerInternal.bind(this, undefined, true));
        pickerToolbar.appendToolbarItem(this.bgColorPickerButton);
        this.bgColorPickedBound = this.bgColorPicked.bind(this);
        this.bgColorSwatch = new Swatch(bgColorContainer);
        this.contrastInfo.addEventListener("ContrastInfoUpdated" /* ContrastInfoUpdated */, this.update.bind(this));
    }
    showNoContrastInfoAvailableMessage() {
        this.noContrastInfoAvailable.classList.remove('hidden');
    }
    hideNoContrastInfoAvailableMessage() {
        this.noContrastInfoAvailable.classList.add('hidden');
    }
    computeSuggestedColor(threshold) {
        const fgColor = this.contrastInfo.color();
        const bgColor = this.contrastInfo.bgColor();
        if (!fgColor || !bgColor) {
            return;
        }
        if (threshold === 'APCA') {
            const requiredContrast = this.contrastInfo.contrastRatioAPCAThreshold();
            if (requiredContrast === null) {
                return;
            }
            // We add 1% to the min required contrast to make sure we are over the limit.
            return Common.Color.Color.findFgColorForContrastAPCA(fgColor, bgColor, requiredContrast + 1);
        }
        const requiredContrast = this.contrastInfo.contrastRatioThreshold(threshold);
        if (!requiredContrast) {
            return;
        }
        // We add a bit to the required contrast to make sure we are over the limit.
        return Common.Color.Color.findFgColorForContrast(fgColor, bgColor, requiredContrast + 0.1);
    }
    onSuggestColor(threshold) {
        const color = this.computeSuggestedColor(threshold);
        if (color) {
            this.colorSelectedCallback(color);
        }
    }
    createFixColorButton(parent, suggestedColor) {
        const button = parent.createChild('button', 'contrast-fix-button');
        const originalColorFormat = this.contrastInfo.colorFormat();
        const colorFormat = originalColorFormat && originalColorFormat !== Common.Color.Format.Nickname &&
            originalColorFormat !== Common.Color.Format.Original ?
            originalColorFormat :
            Common.Color.Format.HEXA;
        const formattedColor = suggestedColor.asString(colorFormat);
        const suggestedColorString = formattedColor ? formattedColor + ' ' : '';
        const label = i18nString(UIStrings.useSuggestedColorStoFixLow, { PH1: suggestedColorString });
        UI.ARIAUtils.setAccessibleName(button, label);
        UI.Tooltip.Tooltip.install(button, label);
        button.tabIndex = 0;
        button.style.backgroundColor = suggestedColorString;
        return button;
    }
    update() {
        if (this.contrastInfo.isNull()) {
            this.showNoContrastInfoAvailableMessage();
            this.setVisible(false);
            return;
        }
        this.setVisible(true);
        this.hideNoContrastInfoAvailableMessage();
        const isAPCAEnabled = Root.Runtime.experiments.isEnabled('APCA');
        const fgColor = this.contrastInfo.color();
        const bgColor = this.contrastInfo.bgColor();
        if (isAPCAEnabled) {
            const apcaContrastRatio = this.contrastInfo.contrastRatioAPCA();
            if (apcaContrastRatio === null || !bgColor || !fgColor) {
                this.contrastUnknown = true;
                this.contrastValue.textContent = '';
                this.contrastValueBubble.classList.add('contrast-unknown');
                this.chooseBgColor.classList.remove('hidden');
                this.contrastThresholds.classList.add('hidden');
                this.showNoContrastInfoAvailableMessage();
                return;
            }
            this.contrastUnknown = false;
            this.chooseBgColor.classList.add('hidden');
            this.contrastThresholds.classList.remove('hidden');
            this.contrastValueBubble.classList.remove('contrast-unknown');
            this.contrastValue.textContent = `${Platform.NumberUtilities.floor(apcaContrastRatio, 2)}%`;
            const apcaThreshold = this.contrastInfo.contrastRatioAPCAThreshold();
            const passesAPCA = apcaContrastRatio && apcaThreshold ? Math.abs(apcaContrastRatio) >= apcaThreshold : false;
            this.contrastPassFailAPCA.removeChildren();
            const labelAPCA = this.contrastPassFailAPCA.createChild('span', 'contrast-link-label');
            labelAPCA.textContent = i18nString(UIStrings.apca);
            if (apcaThreshold !== null) {
                this.contrastPassFailAPCA.createChild('span').textContent = `: ${apcaThreshold.toFixed(2)}%`;
            }
            if (passesAPCA) {
                this.contrastPassFailAPCA.appendChild(UI.Icon.Icon.create('smallicon-checkmark-square'));
            }
            else {
                this.contrastPassFailAPCA.appendChild(UI.Icon.Icon.create('smallicon-no'));
                const suggestedColor = this.computeSuggestedColor('APCA');
                if (suggestedColor) {
                    const fixAPCA = this.createFixColorButton(this.contrastPassFailAPCA, suggestedColor);
                    fixAPCA.addEventListener('click', () => this.onSuggestColor('APCA'));
                }
            }
            labelAPCA.addEventListener('click', (_event) => ContrastDetails.showHelp());
            this.elementInternal.classList.toggle('contrast-fail', !passesAPCA);
            this.contrastValueBubble.classList.toggle('contrast-aa', passesAPCA);
            return;
        }
        const contrastRatio = this.contrastInfo.contrastRatio();
        if (!contrastRatio || !bgColor || !fgColor) {
            this.contrastUnknown = true;
            this.contrastValue.textContent = '';
            this.contrastValueBubble.classList.add('contrast-unknown');
            this.chooseBgColor.classList.remove('hidden');
            this.contrastThresholds.classList.add('hidden');
            this.showNoContrastInfoAvailableMessage();
            return;
        }
        this.contrastUnknown = false;
        this.chooseBgColor.classList.add('hidden');
        this.contrastThresholds.classList.remove('hidden');
        this.contrastValueBubble.classList.remove('contrast-unknown');
        this.contrastValue.textContent = String(Platform.NumberUtilities.floor(contrastRatio, 2));
        this.bgColorSwatch.setColors(fgColor, bgColor);
        // In greater then comparisons we can substite null with 0.
        const aa = this.contrastInfo.contrastRatioThreshold('aa') || 0;
        this.passesAA = (this.contrastInfo.contrastRatio() || 0) >= aa;
        this.contrastPassFailAA.removeChildren();
        const labelAA = this.contrastPassFailAA.createChild('span', 'contrast-link-label');
        labelAA.textContent = i18nString(UIStrings.aa);
        this.contrastPassFailAA.createChild('span').textContent =
            i18nString(UIStrings.placeholderWithColon, { PH1: aa.toFixed(1) });
        if (this.passesAA) {
            this.contrastPassFailAA.appendChild(UI.Icon.Icon.create('smallicon-checkmark-square'));
        }
        else {
            this.contrastPassFailAA.appendChild(UI.Icon.Icon.create('smallicon-no'));
            const suggestedColor = this.computeSuggestedColor('aa');
            if (suggestedColor) {
                const fixAA = this.createFixColorButton(this.contrastPassFailAA, suggestedColor);
                fixAA.addEventListener('click', () => this.onSuggestColor('aa'));
            }
        }
        // In greater then comparisons we can substite null with 0.
        const aaa = this.contrastInfo.contrastRatioThreshold('aaa') || 0;
        const passesAAA = (this.contrastInfo.contrastRatio() || 0) >= aaa;
        this.contrastPassFailAAA.removeChildren();
        const labelAAA = this.contrastPassFailAAA.createChild('span', 'contrast-link-label');
        labelAAA.textContent = i18nString(UIStrings.aaa);
        this.contrastPassFailAAA.createChild('span').textContent =
            i18nString(UIStrings.placeholderWithColon, { PH1: aaa.toFixed(1) });
        if (passesAAA) {
            this.contrastPassFailAAA.appendChild(UI.Icon.Icon.create('smallicon-checkmark-square'));
        }
        else {
            this.contrastPassFailAAA.appendChild(UI.Icon.Icon.create('smallicon-no'));
            const suggestedColor = this.computeSuggestedColor('aaa');
            if (suggestedColor) {
                const fixAAA = this.createFixColorButton(this.contrastPassFailAAA, suggestedColor);
                fixAAA.addEventListener('click', () => this.onSuggestColor('aaa'));
            }
        }
        [labelAA, labelAAA].forEach(e => e.addEventListener('click', () => ContrastDetails.showHelp()));
        this.elementInternal.classList.toggle('contrast-fail', !this.passesAA);
        this.contrastValueBubble.classList.toggle('contrast-aa', this.passesAA);
        this.contrastValueBubble.classList.toggle('contrast-aaa', passesAAA);
    }
    static showHelp() {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(UI.UIUtils.addReferrerToURL('https://web.dev/color-and-contrast-accessibility/'));
    }
    setVisible(visible) {
        this.visibleInternal = visible;
        this.elementInternal.classList.toggle('hidden', !visible);
    }
    visible() {
        return this.visibleInternal;
    }
    element() {
        return this.elementInternal;
    }
    expandButtonClicked() {
        const selection = this.contrastValueBubble.getComponentSelection();
        if (selection) {
            selection.empty();
        }
        this.toggleExpanded();
    }
    topRowClicked(event) {
        const selection = this.contrastValueBubble.getComponentSelection();
        if (selection) {
            selection.empty();
        }
        this.toggleExpanded();
        event.consume(true);
    }
    toggleExpanded() {
        this.expandedInternal = !this.expandedInternal;
        UI.ARIAUtils.setExpanded(this.expandButton.element, this.expandedInternal);
        this.elementInternal.classList.toggle('collapsed', !this.expandedInternal);
        if (this.expandedInternal) {
            this.toggleMainColorPicker(false);
            this.expandButton.setGlyph('smallicon-expand-less');
            this.expandButton.setTitle(i18nString(UIStrings.showLess));
            if (this.contrastUnknown) {
                this.toggleBackgroundColorPickerInternal(true);
            }
        }
        else {
            this.toggleBackgroundColorPickerInternal(false);
            this.expandButton.setGlyph('smallicon-expand-more');
            this.expandButton.setTitle(i18nString(UIStrings.showMore));
        }
        this.expandedChangedCallback();
    }
    collapse() {
        this.elementInternal.classList.remove('expanded');
        this.toggleBackgroundColorPickerInternal(false);
        this.toggleMainColorPicker(false);
    }
    expanded() {
        return this.expandedInternal;
    }
    backgroundColorPickerEnabled() {
        return this.bgColorPickerButton.toggled();
    }
    toggleBackgroundColorPicker(enabled) {
        this.toggleBackgroundColorPickerInternal(enabled, false);
    }
    toggleBackgroundColorPickerInternal(enabled, shouldTriggerEvent = true) {
        if (enabled === undefined) {
            enabled = !this.bgColorPickerButton.toggled();
        }
        this.bgColorPickerButton.setToggled(enabled);
        if (shouldTriggerEvent) {
            this.dispatchEventToListeners("BackgroundColorPickerWillBeToggled" /* BackgroundColorPickerWillBeToggled */, enabled);
        }
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.setEyeDropperActive(enabled);
        if (enabled) {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.EyeDropperPickedColor, this.bgColorPickedBound);
        }
        else {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.removeEventListener(Host.InspectorFrontendHostAPI.Events.EyeDropperPickedColor, this.bgColorPickedBound);
        }
    }
    bgColorPicked({ data: rgbColor, }) {
        const rgba = [rgbColor.r, rgbColor.g, rgbColor.b, (rgbColor.a / 2.55 | 0) / 100];
        const color = Common.Color.Color.fromRGBA(rgba);
        this.contrastInfo.setBgColor(color);
        this.toggleBackgroundColorPickerInternal(false);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.bringToFront();
    }
}
export class Swatch {
    parentElement;
    swatchElement;
    swatchInnerElement;
    textPreview;
    constructor(parentElement) {
        this.parentElement = parentElement;
        this.swatchElement = parentElement.createChild('span', 'swatch contrast swatch-inner-white');
        this.swatchInnerElement = this.swatchElement.createChild('span', 'swatch-inner');
        this.textPreview = this.swatchElement.createChild('div', 'text-preview');
        this.textPreview.textContent = 'Aa';
    }
    setColors(fgColor, bgColor) {
        this.textPreview.style.color = fgColor.asString(Common.Color.Format.RGBA);
        this.swatchInnerElement.style.backgroundColor = bgColor.asString(Common.Color.Format.RGBA);
        // Show border if the swatch is white.
        this.swatchElement.classList.toggle('swatch-inner-white', bgColor.hsla()[2] > 0.9);
    }
}
//# sourceMappingURL=ContrastDetails.js.map