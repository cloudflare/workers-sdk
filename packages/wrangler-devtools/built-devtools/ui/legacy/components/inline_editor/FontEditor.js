// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../../core/common/common.js';
import * as i18n from '../../../../core/i18n/i18n.js';
import * as SDK from '../../../../core/sdk/sdk.js';
import * as IconButton from '../../../components/icon_button/icon_button.js';
import * as UI from '../../legacy.js';
import fontEditorStyles from './fontEditor.css.js';
import * as FontEditorUnitConverter from './FontEditorUnitConverter.js';
import * as FontEditorUtils from './FontEditorUtils.js';
const UIStrings = {
    /**
    *@description Font editor label for font family selector
    */
    fontFamily: 'Font Family',
    /**
    *@description Section header for CSS property inputs
    */
    cssProperties: 'CSS Properties',
    /**
    *@description Font size slider label for Font Editor
    */
    fontSize: 'Font Size',
    /**
    *@description Line height slider label for Font Editor
    */
    lineHeight: 'Line Height',
    /**
    *@description Font weight slider label for Font Editor
    */
    fontWeight: 'Font Weight',
    /**
    *@description Label for letter-spacing labels
    */
    spacing: 'Spacing',
    /**
    *@description Label for numbered fallback selectors
    *@example {2} PH1
    */
    fallbackS: 'Fallback {PH1}',
    /**
    *@description Announcement for deleting an empty font family selector in the Font Editor
    *@example {2} PH1
    */
    thereIsNoValueToDeleteAtIndexS: 'There is no value to delete at index: {PH1}',
    /**
    *@description Announcement when deleting a font selector in the Font Editor
    *@example {2} PH1
    */
    fontSelectorDeletedAtIndexS: 'Font Selector deleted at index: {PH1}',
    /**
    *@description Label for Font Editor button to delete font family/fallback selectors
    *@example {Fallback 1} PH1
    */
    deleteS: 'Delete {PH1}',
    /**
    * @description Warning message for Font Editor invalid text input. The placeholder is the name of
    * the CSS attribute that is incorrect.
    * @example {font-size} PH1
    */
    PleaseEnterAValidValueForSText: '* Please enter a valid value for {PH1} text input',
    /**
    *@description Error text in Font Editor
    *@example {font-size} PH1
    */
    thisPropertyIsSetToContainUnits: 'This property is set to contain units but does not have a defined corresponding unitsArray: {PH1}',
    /**
    *@description Label for slider input in the Font Editor.
    *@example {font-size} PH1
    */
    sSliderInput: '{PH1} Slider Input',
    /**
    *@description Accessible label for a text input for a property in the Font Editor.
    *@example {font-size} PH1
    */
    sTextInput: '{PH1} Text Input',
    /**
    *@description Font Editor units text box label
    */
    units: 'Units',
    /**
    * @description Accessible name for Font Editor unit input. The placeholder is the name of the font
    * property that this UI input controls. e.g. font-size, line-height, line-weight.
    * @example {font-size} PH1
    */
    sUnitInput: '{PH1} Unit Input',
    /**
    *@description Text used in the Font Editor for the key values selector
    *@example {font-size} PH1
    */
    sKeyValueSelector: '{PH1} Key Value Selector',
    /**
    * @description Label for Font Editor toggle input type button. The placeholder is the name of the
    * font property that this UI input controls. e.g. font-size, line-height, line-weight. Tooltip for
    * a button next to the text input which allows the user to change the input type. When they click
    * this button, the UI changes to allow the user to choose from a list of pre-selected font
    * categories.
    * @example {font-size} PH1
    */
    sToggleInputType: '{PH1} toggle input type',
    /**
    *@description Label for Font Editor alert in CSS Properties section when toggling inputs
    */
    selectorInputMode: 'Selector Input Mode',
    /**
    *@description Label for Font Editor alert in CSS Properties section when toggling inputs
    */
    sliderInputMode: 'Slider Input Mode',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/components/inline_editor/FontEditor.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class FontEditor extends Common.ObjectWrapper.eventMixin(UI.Widget.VBox) {
    selectedNode;
    propertyMap;
    fontSelectorSection;
    fontSelectors;
    fontsList;
    constructor(propertyMap) {
        super(true);
        this.selectedNode = UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode);
        this.propertyMap = propertyMap;
        this.contentElement.tabIndex = 0;
        this.setDefaultFocusedElement(this.contentElement);
        // Font Selector Section
        this.fontSelectorSection = this.contentElement.createChild('div', 'font-selector-section');
        this.fontSelectorSection.createChild('h2', 'font-section-header').textContent = i18nString(UIStrings.fontFamily);
        this.fontSelectors = [];
        this.fontsList = null;
        const propertyValue = this.propertyMap.get('font-family');
        void this.createFontSelectorSection(propertyValue);
        //  CSS Font Property Section
        const cssPropertySection = this.contentElement.createChild('div', 'font-section');
        cssPropertySection.createChild('h2', 'font-section-header').textContent = i18nString(UIStrings.cssProperties);
        // The regexes only handle valid property values as invalid values are not passed into the property map.
        const fontSizePropertyInfo = this.getPropertyInfo('font-size', FontEditorUtils.FontSizeStaticParams.regex);
        const lineHeightPropertyInfo = this.getPropertyInfo('line-height', FontEditorUtils.LineHeightStaticParams.regex);
        const fontWeightPropertyInfo = this.getPropertyInfo('font-weight', FontEditorUtils.FontWeightStaticParams.regex);
        const letterSpacingPropertyInfo = this.getPropertyInfo('letter-spacing', FontEditorUtils.LetterSpacingStaticParams.regex);
        new FontPropertyInputs('font-size', i18nString(UIStrings.fontSize), cssPropertySection, fontSizePropertyInfo, FontEditorUtils.FontSizeStaticParams, this.updatePropertyValue.bind(this), this.resizePopout.bind(this), 
        /** hasUnits= */ true);
        new FontPropertyInputs('line-height', i18nString(UIStrings.lineHeight), cssPropertySection, lineHeightPropertyInfo, FontEditorUtils.LineHeightStaticParams, this.updatePropertyValue.bind(this), this.resizePopout.bind(this), 
        /** hasUnits= */ true);
        new FontPropertyInputs('font-weight', i18nString(UIStrings.fontWeight), cssPropertySection, fontWeightPropertyInfo, FontEditorUtils.FontWeightStaticParams, this.updatePropertyValue.bind(this), this.resizePopout.bind(this), 
        /** hasUnits= */ false);
        new FontPropertyInputs('letter-spacing', i18nString(UIStrings.spacing), cssPropertySection, letterSpacingPropertyInfo, FontEditorUtils.LetterSpacingStaticParams, this.updatePropertyValue.bind(this), this.resizePopout.bind(this), 
        /** hasUnits= */ true);
    }
    wasShown() {
        this.registerCSSFiles([fontEditorStyles]);
    }
    async createFontSelectorSection(propertyValue) {
        if (propertyValue) {
            // FIXME(crbug.com/1148434): propertyValue will not be split correctly for font family names that contain commas.
            // e.g. font-family: "Name,with,commas"
            const splitValue = propertyValue.split(',');
            await this.createFontSelector(splitValue[0], /* isPrimary= */ true);
            if (!FontEditorUtils.GlobalValues.includes(splitValue[0])) {
                // We add one to the splitValue length so that we have an additional empty fallback selector
                for (let i = 1; i < splitValue.length + 1; i++) {
                    void this.createFontSelector(splitValue[i]);
                }
            }
        }
        else {
            void this.createFontSelector('', true);
        }
        this.resizePopout();
    }
    async createFontsList() {
        const computedFontArray = await FontEditorUtils.generateComputedFontArray();
        const computedMap = new Map();
        const splicedArray = this.splitComputedFontArray(computedFontArray);
        computedMap.set('Computed Fonts', splicedArray);
        const systemMap = new Map();
        systemMap.set('System Fonts', FontEditorUtils.SystemFonts);
        systemMap.set('Generic Families', FontEditorUtils.GenericFonts);
        const fontList = [];
        fontList.push(computedMap);
        fontList.push(systemMap);
        return fontList;
    }
    splitComputedFontArray(computedFontArray) {
        const array = [];
        for (const fontFamilyValue of computedFontArray) {
            if (fontFamilyValue.includes(',')) {
                const fonts = fontFamilyValue.split(',');
                fonts.forEach(element => {
                    if (array.findIndex(item => item.toLowerCase() === element.trim().toLowerCase().replace(/"/g, '\'')) === -1) {
                        array.push(element.trim().replace(/"/g, ''));
                    }
                });
            }
            else if (array.findIndex(item => item.toLowerCase() === fontFamilyValue.toLowerCase().replace('"', '\'')) === -1) {
                array.push(fontFamilyValue.replace(/"/g, ''));
            }
        }
        return array;
    }
    async createFontSelector(value, isPrimary) {
        // FIXME(crbug.com/1148434): Custom font family names that use single/double quotes in the font family name will not be handled correctly.
        // e.g. font-family: "FontWith\"DoubleQuotes"
        value = value ? value.trim() : '';
        if (value) {
            const firstChar = value.charAt(0);
            if (firstChar === '\'') {
                value = value.replace(/'/g, '');
            }
            else if (firstChar === '"') {
                value = value.replace(/"/g, '');
            }
        }
        const selectorField = this.fontSelectorSection.createChild('div', 'shadow-editor-field shadow-editor-flex-field');
        if (!this.fontsList) {
            this.fontsList = await this.createFontsList();
        }
        let label;
        if (isPrimary) {
            label = i18nString(UIStrings.fontFamily);
            const globalValuesMap = new Map([['Global Values', FontEditorUtils.GlobalValues]]);
            const primaryFontList = [...this.fontsList];
            primaryFontList.push(globalValuesMap);
            this.createSelector(selectorField, label, primaryFontList, value.trim());
        }
        else {
            label = i18nString(UIStrings.fallbackS, { PH1: this.fontSelectors.length });
            this.createSelector(selectorField, label, this.fontsList, value.trim());
        }
    }
    deleteFontSelector(index, isGlobalValue) {
        let fontSelectorObject = this.fontSelectors[index];
        const isPrimary = index === 0;
        if (fontSelectorObject.input.value === '' && !isGlobalValue) {
            UI.ARIAUtils.alert(i18nString(UIStrings.thereIsNoValueToDeleteAtIndexS, { PH1: index }));
            return;
        }
        if (isPrimary) {
            // When deleting the primary font selector, we overwrite the value of the primary selector
            // with the value of the secondary selector and delete the secondary selector.
            const secondarySelector = this.fontSelectors[1];
            let newPrimarySelectorValue = '';
            if (secondarySelector) {
                newPrimarySelectorValue = secondarySelector.input.value;
                fontSelectorObject = secondarySelector;
            }
            const primarySelector = this.fontSelectors[0].input;
            primarySelector.value = newPrimarySelectorValue;
            index = 1;
        }
        if (fontSelectorObject.input.parentNode) {
            const hasSecondarySelector = this.fontSelectors.length > 1;
            if (!isPrimary || hasSecondarySelector) {
                const selectorElement = fontSelectorObject.input.parentElement;
                if (selectorElement) {
                    selectorElement.remove();
                    this.fontSelectors.splice(index, 1);
                    this.updateFontSelectorList();
                }
            }
            UI.ARIAUtils.alert(i18nString(UIStrings.fontSelectorDeletedAtIndexS, { PH1: index }));
        }
        this.onFontSelectorChanged();
        this.resizePopout();
        const focusIndex = isPrimary ? 0 : index - 1;
        this.fontSelectors[focusIndex].input.focus();
    }
    updateFontSelectorList() {
        for (let i = 0; i < this.fontSelectors.length; i++) {
            const fontSelectorObject = this.fontSelectors[i];
            let label;
            if (i === 0) {
                label = i18nString(UIStrings.fontFamily);
            }
            else {
                label = i18nString(UIStrings.fallbackS, { PH1: i });
            }
            fontSelectorObject.label.textContent = label;
            UI.ARIAUtils.setAccessibleName(fontSelectorObject.input, label);
            fontSelectorObject.deleteButton.setTitle(i18nString(UIStrings.deleteS, { PH1: label }));
            fontSelectorObject.index = i;
        }
    }
    getPropertyInfo(name, regex) {
        const value = this.propertyMap.get(name);
        if (value) {
            const valueString = value;
            const match = valueString.match(regex);
            if (match) {
                const retValue = match[1].charAt(0) === '+' ? match[1].substr(1) : match[1];
                const retUnits = match[2] ? match[2] : '';
                return { value: retValue, units: retUnits };
            }
            return { value: valueString, units: null };
        }
        return { value: null, units: null };
    }
    createSelector(field, label, options, currentValue) {
        const index = this.fontSelectors.length;
        const selectInput = UI.UIUtils.createSelect(label, options);
        selectInput.value = currentValue;
        const selectLabel = UI.UIUtils.createLabel(label, 'shadow-editor-label', selectInput);
        selectInput.addEventListener('input', this.onFontSelectorChanged.bind(this), false);
        // We want to prevent the Enter key from propagating to the SwatchPopoverHelper which will close the editor.
        selectInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.consume();
            }
        }, false);
        field.appendChild(selectLabel);
        field.appendChild(selectInput);
        const deleteToolbar = new UI.Toolbar.Toolbar('', field);
        const deleteButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.deleteS, { PH1: label }), 'largeicon-trash-bin');
        deleteToolbar.appendToolbarItem(deleteButton);
        const fontSelectorObject = { label: selectLabel, input: selectInput, deleteButton, index };
        deleteButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
            this.deleteFontSelector(fontSelectorObject.index);
        });
        deleteButton.element.addEventListener('keydown', (event) => {
            if (isEnterOrSpaceKey(event)) {
                this.deleteFontSelector(fontSelectorObject.index);
                event.consume();
            }
        }, false);
        this.fontSelectors.push(fontSelectorObject);
    }
    onFontSelectorChanged() {
        let value = '';
        const isGlobalValue = FontEditorUtils.GlobalValues.includes(this.fontSelectors[0].input.value);
        if (isGlobalValue) {
            for (let i = 1; i < this.fontSelectors.length; i++) {
                this.deleteFontSelector(i, /** isGlobalValue= */ true);
            }
        }
        for (const fontSelector of this.fontSelectors) {
            const fontSelectorInput = fontSelector.input;
            if (fontSelectorInput.value !== '') {
                if (value === '') {
                    value = this.fontSelectors[0].input.value;
                }
                else {
                    value += ', ' + fontSelectorInput.value;
                }
            }
        }
        // Add an extra blank selector as long as the last selector doesn't have an empty value, the primary
        // selector's value is not a global value and if the list of selectors has not exceeded 10.
        if (this.fontSelectors[this.fontSelectors.length - 1].input.value !== '' && !isGlobalValue &&
            this.fontSelectors.length < 10) {
            void this.createFontSelector(/** value= */ '');
            this.resizePopout();
        }
        this.updatePropertyValue('font-family', value);
    }
    updatePropertyValue(propertyName, value) {
        this.dispatchEventToListeners(Events.FontChanged, { propertyName, value });
    }
    resizePopout() {
        this.dispatchEventToListeners(Events.FontEditorResized);
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["FontChanged"] = "FontChanged";
    Events["FontEditorResized"] = "FontEditorResized";
})(Events || (Events = {}));
class FontPropertyInputs {
    showSliderMode;
    errorText;
    propertyInfo;
    propertyName;
    staticParams;
    hasUnits;
    units;
    addedUnit;
    initialRange;
    boundUpdateCallback;
    boundResizeCallback;
    selectedNode;
    sliderInput;
    textBoxInput;
    unitInput;
    selectorInput;
    applyNextInput;
    constructor(propertyName, label, field, propertyInfo, staticParams, updateCallback, resizeCallback, hasUnits) {
        this.showSliderMode = true;
        const propertyField = field.createChild('div', 'shadow-editor-field shadow-editor-flex-field');
        this.errorText = field.createChild('div', 'error-text');
        this.errorText.textContent = i18nString(UIStrings.PleaseEnterAValidValueForSText, { PH1: propertyName });
        this.errorText.hidden = true;
        UI.ARIAUtils.markAsAlert(this.errorText);
        this.propertyInfo = propertyInfo;
        this.propertyName = propertyName;
        this.staticParams = staticParams;
        // Unit handling
        this.hasUnits = hasUnits;
        if (this.hasUnits && this.staticParams.units && this.staticParams.defaultUnit !== null) {
            const defaultUnits = this.staticParams.defaultUnit;
            this.units = propertyInfo.units !== null ? propertyInfo.units : defaultUnits;
            this.addedUnit = !this.staticParams.units.has(this.units);
        }
        else if (this.hasUnits) {
            throw new Error(i18nString(UIStrings.thisPropertyIsSetToContainUnits, { PH1: propertyName }));
        }
        else {
            this.units = '';
        }
        this.initialRange = this.getUnitRange();
        this.boundUpdateCallback = updateCallback;
        this.boundResizeCallback = resizeCallback;
        this.selectedNode = UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode);
        const propertyLabel = UI.UIUtils.createLabel(label, 'shadow-editor-label');
        propertyField.append(propertyLabel);
        this.sliderInput = this.createSliderInput(propertyField, label);
        this.textBoxInput = this.createTextBoxInput(propertyField);
        UI.ARIAUtils.bindLabelToControl(propertyLabel, this.textBoxInput);
        this.unitInput = this.createUnitInput(propertyField);
        this.selectorInput = this.createSelectorInput(propertyField);
        this.createTypeToggle(propertyField);
        this.checkSelectorValueAndToggle();
        this.applyNextInput = false;
    }
    setInvalidTextBoxInput(invalid) {
        if (invalid) {
            if (this.errorText.hidden) {
                this.errorText.hidden = false;
                this.textBoxInput.classList.add('error-input');
                this.boundResizeCallback();
            }
        }
        else {
            if (!this.errorText.hidden) {
                this.errorText.hidden = true;
                this.textBoxInput.classList.remove('error-input');
                this.boundResizeCallback();
            }
        }
    }
    checkSelectorValueAndToggle() {
        if (this.staticParams.keyValues && this.propertyInfo.value !== null &&
            (this.staticParams.keyValues.has(this.propertyInfo.value))) {
            this.toggleInputType();
            return true;
        }
        return false;
    }
    getUnitRange() {
        let min = 0;
        let max = 100;
        let step = 1;
        if (this.propertyInfo.value !== null && /\d/.test(this.propertyInfo.value)) {
            if (this.staticParams.rangeMap.get(this.units)) {
                const unitRangeMap = this.staticParams.rangeMap.get(this.units);
                if (unitRangeMap) {
                    min = Math.min(unitRangeMap.min, parseFloat(this.propertyInfo.value));
                    max = Math.max(unitRangeMap.max, parseFloat(this.propertyInfo.value));
                    step = unitRangeMap.step;
                }
            }
            else {
                const unitRangeMap = this.staticParams.rangeMap.get('px');
                if (unitRangeMap) {
                    min = Math.min(unitRangeMap.min, parseFloat(this.propertyInfo.value));
                    max = Math.max(unitRangeMap.max, parseFloat(this.propertyInfo.value));
                    step = unitRangeMap.step;
                }
            }
        }
        else {
            const unitRangeMap = this.staticParams.rangeMap.get(this.units);
            if (unitRangeMap) {
                min = unitRangeMap.min;
                max = unitRangeMap.max;
                step = unitRangeMap.step;
            }
        }
        return { min, max, step };
    }
    createSliderInput(field, _label) {
        const min = this.initialRange.min;
        const max = this.initialRange.max;
        const step = this.initialRange.step;
        const slider = UI.UIUtils.createSlider(min, max, -1);
        slider.sliderElement.step = step.toString();
        slider.sliderElement.tabIndex = 0;
        if (this.propertyInfo.value) {
            slider.value = parseFloat(this.propertyInfo.value);
        }
        else {
            const newValue = (min + max) / 2;
            slider.value = newValue;
        }
        slider.addEventListener('input', event => {
            this.onSliderInput(event, /** apply= */ false);
        });
        slider.addEventListener('mouseup', event => {
            this.onSliderInput(event, /** apply= */ true);
        });
        slider.addEventListener('keydown', event => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' ||
                event.key === 'ArrowRight') {
                // Pressing an arrow key will trigger two events for the slider: A keyboard event and an input event
                // The keyboard event will come before the slider value has changed and the subsequent input event will cause
                // the value to change.  We use the applyNextInput boolean to tell onSliderInput that the next input event
                // is coming because of the keyboard event and that it should be applied to the section.
                this.applyNextInput = true;
            }
        });
        field.appendChild(slider);
        UI.ARIAUtils.setAccessibleName(slider.sliderElement, i18nString(UIStrings.sSliderInput, { PH1: this.propertyName }));
        return slider;
    }
    createTextBoxInput(field) {
        const textBoxInput = UI.UIUtils.createInput('shadow-editor-text-input', 'number');
        textBoxInput.step = this.initialRange.step.toString();
        textBoxInput.classList.add('font-editor-text-input');
        if (this.propertyInfo.value !== null) {
            if (this.propertyInfo.value.charAt(0) === '+') {
                this.propertyInfo.value = this.propertyInfo.value.substr(1);
            }
            textBoxInput.value = this.propertyInfo.value;
        }
        textBoxInput.step = 'any';
        textBoxInput.addEventListener('input', this.onTextBoxInput.bind(this), false);
        field.appendChild(textBoxInput);
        UI.ARIAUtils.setAccessibleName(textBoxInput, i18nString(UIStrings.sTextInput, { PH1: this.propertyName }));
        return textBoxInput;
    }
    createUnitInput(field) {
        let unitInput;
        if (this.hasUnits && this.staticParams.units) {
            const currentValue = this.propertyInfo.units;
            const options = this.staticParams.units;
            unitInput = UI.UIUtils.createSelect(i18nString(UIStrings.units), options);
            unitInput.classList.add('font-editor-select');
            if (this.addedUnit && currentValue) {
                unitInput.add(new Option(currentValue, currentValue));
            }
            if (currentValue) {
                unitInput.value = currentValue;
            }
            unitInput.addEventListener('change', this.onUnitInput.bind(this), false);
        }
        else {
            unitInput = UI.UIUtils.createSelect(i18nString(UIStrings.units), []);
            unitInput.classList.add('font-editor-select');
            unitInput.disabled = true;
        }
        // We want to prevent the Enter key from propagating to the SwatchPopoverHelper which will close the editor.
        unitInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.consume();
            }
        }, false);
        field.appendChild(unitInput);
        UI.ARIAUtils.setAccessibleName(unitInput, i18nString(UIStrings.sUnitInput, { PH1: this.propertyName }));
        return unitInput;
    }
    createSelectorInput(field) {
        const selectInput = UI.UIUtils.createSelect(i18nString(UIStrings.sKeyValueSelector, { PH1: this.propertyName }), this.staticParams.keyValues);
        selectInput.classList.add('font-selector-input');
        if (this.propertyInfo.value) {
            selectInput.value = this.propertyInfo.value;
        }
        selectInput.addEventListener('input', this.onSelectorInput.bind(this), false);
        // We want to prevent the Enter key from propagating to the SwatchPopoverHelper which will close the editor.
        selectInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.consume();
            }
        }, false);
        field.appendChild(selectInput);
        selectInput.hidden = true;
        return selectInput;
    }
    onSelectorInput(event) {
        if (event.currentTarget) {
            const value = event.currentTarget.value;
            this.textBoxInput.value = '';
            const newValue = (parseFloat(this.sliderInput.sliderElement.min) + parseFloat(this.sliderInput.sliderElement.max)) / 2;
            this.sliderInput.value = newValue;
            this.setInvalidTextBoxInput(false);
            this.boundUpdateCallback(this.propertyName, value);
        }
    }
    onSliderInput(event, apply) {
        const target = event.currentTarget;
        if (target) {
            const value = target.value;
            this.textBoxInput.value = value;
            this.selectorInput.value = '';
            const valueString = this.hasUnits ? value + this.unitInput.value : value.toString();
            this.setInvalidTextBoxInput(false);
            if (apply || this.applyNextInput) {
                this.boundUpdateCallback(this.propertyName, valueString);
                this.applyNextInput = false;
            }
        }
    }
    onTextBoxInput(event) {
        const target = event.currentTarget;
        if (target) {
            const value = target.value;
            const units = value === '' ? '' : this.unitInput.value;
            const valueString = value + units;
            if (this.staticParams.regex.test(valueString) || (value === '' && !target.validationMessage.length)) {
                if (parseFloat(value) > parseFloat(this.sliderInput.sliderElement.max)) {
                    this.sliderInput.sliderElement.max = value;
                }
                else if (parseFloat(value) < parseFloat(this.sliderInput.sliderElement.min)) {
                    this.sliderInput.sliderElement.min = value;
                }
                this.sliderInput.value = parseFloat(value);
                this.selectorInput.value = '';
                this.setInvalidTextBoxInput(false);
                this.boundUpdateCallback(this.propertyName, valueString);
            }
            else {
                this.setInvalidTextBoxInput(true);
            }
        }
    }
    async onUnitInput(event) {
        const unitInput = event.currentTarget;
        const hasFocus = unitInput.hasFocus();
        const newUnit = unitInput.value;
        unitInput.disabled = true;
        const prevUnit = this.units;
        const conversionMultiplier = await FontEditorUnitConverter.getUnitConversionMultiplier(prevUnit, newUnit, this.propertyName === 'font-size');
        this.setInputUnits(conversionMultiplier, newUnit);
        if (this.textBoxInput.value) {
            this.boundUpdateCallback(this.propertyName, this.textBoxInput.value + newUnit);
        }
        this.units = newUnit;
        unitInput.disabled = false;
        if (hasFocus) {
            unitInput.focus();
        }
    }
    createTypeToggle(field) {
        const displaySwitcher = field.createChild('div', 'spectrum-switcher');
        const icon = new IconButton.Icon.Icon();
        icon.data = { iconName: 'switcherIcon', color: 'var(--color-text-primary)', width: '16px', height: '16px' };
        displaySwitcher.appendChild(icon);
        UI.UIUtils.setTitle(displaySwitcher, i18nString(UIStrings.sToggleInputType, { PH1: this.propertyName }));
        displaySwitcher.tabIndex = 0;
        self.onInvokeElement(displaySwitcher, this.toggleInputType.bind(this));
        UI.ARIAUtils.markAsButton(displaySwitcher);
    }
    toggleInputType(event) {
        if (event && event.key === 'Enter') {
            event.consume();
        }
        if (this.showSliderMode) {
            // Show selector input type
            this.sliderInput.hidden = true;
            this.textBoxInput.hidden = true;
            this.unitInput.hidden = true;
            this.selectorInput.hidden = false;
            this.showSliderMode = false;
            UI.ARIAUtils.alert(i18nString(UIStrings.selectorInputMode));
        }
        else {
            // Show sliderinput type
            this.sliderInput.hidden = false;
            this.textBoxInput.hidden = false;
            this.unitInput.hidden = false;
            this.selectorInput.hidden = true;
            this.showSliderMode = true;
            UI.ARIAUtils.alert(i18nString(UIStrings.sliderInputMode));
        }
    }
    setInputUnits(multiplier, newUnit) {
        const newRangeMap = this.staticParams.rangeMap.get(newUnit);
        let newMin, newMax, newStep;
        if (newRangeMap) {
            newMin = newRangeMap.min;
            newMax = newRangeMap.max;
            newStep = newRangeMap.step;
        }
        else {
            newMin = 0;
            newMax = 100;
            newStep = 1;
        }
        let hasValue = false;
        const roundingPrecision = FontEditorUtils.getRoundingPrecision(newStep);
        let newValue = (newMin + newMax) / 2;
        if (this.textBoxInput.value) {
            hasValue = true;
            newValue = parseFloat((parseFloat(this.textBoxInput.value) * multiplier).toFixed(roundingPrecision));
        }
        this.sliderInput.sliderElement.min = Math.min(newValue, newMin).toString();
        this.sliderInput.sliderElement.max = Math.max(newValue, newMax).toString();
        this.sliderInput.sliderElement.step = newStep.toString();
        this.textBoxInput.step = newStep.toString();
        if (hasValue) {
            this.textBoxInput.value = newValue.toString();
        }
        this.sliderInput.value = newValue;
    }
}
//# sourceMappingURL=FontEditor.js.map