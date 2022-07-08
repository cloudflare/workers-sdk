// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as ColorPicker from '../../ui/legacy/components/color_picker/color_picker.js';
import * as InlineEditor from '../../ui/legacy/components/inline_editor/inline_editor.js';
import * as UI from '../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    * @description Tooltip text for an icon that opens the cubic bezier editor, which is a tool that
    * allows the user to edit cubic-bezier CSS properties directly.
    */
    openCubicBezierEditor: 'Open cubic bezier editor',
    /**
    * @description Tooltip text for an icon that opens shadow editor. The shadow editor is a tool
    * which allows the user to edit CSS shadow properties.
    */
    openShadowEditor: 'Open shadow editor',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/ColorSwatchPopoverIcon.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class BezierPopoverIcon {
    treeElement;
    swatchPopoverHelper;
    swatch;
    boundBezierChanged;
    boundOnScroll;
    bezierEditor;
    scrollerElement;
    originalPropertyText;
    constructor(treeElement, swatchPopoverHelper, swatch) {
        this.treeElement = treeElement;
        this.swatchPopoverHelper = swatchPopoverHelper;
        this.swatch = swatch;
        UI.Tooltip.Tooltip.install(this.swatch.iconElement(), i18nString(UIStrings.openCubicBezierEditor));
        this.swatch.iconElement().addEventListener('click', this.iconClick.bind(this), false);
        this.swatch.iconElement().addEventListener('mousedown', (event) => event.consume(), false);
        this.boundBezierChanged = this.bezierChanged.bind(this);
        this.boundOnScroll = this.onScroll.bind(this);
    }
    iconClick(event) {
        event.consume(true);
        if (this.swatchPopoverHelper.isShowing()) {
            this.swatchPopoverHelper.hide(true);
            return;
        }
        const cubicBezier = UI.Geometry.CubicBezier.parse(this.swatch.bezierText()) ||
            UI.Geometry.CubicBezier.parse('linear');
        this.bezierEditor = new InlineEditor.BezierEditor.BezierEditor(cubicBezier);
        this.bezierEditor.setBezier(cubicBezier);
        this.bezierEditor.addEventListener(InlineEditor.BezierEditor.Events.BezierChanged, this.boundBezierChanged);
        this.swatchPopoverHelper.show(this.bezierEditor, this.swatch.iconElement(), this.onPopoverHidden.bind(this));
        this.scrollerElement = this.swatch.enclosingNodeOrSelfWithClass('style-panes-wrapper');
        if (this.scrollerElement) {
            this.scrollerElement.addEventListener('scroll', this.boundOnScroll, false);
        }
        this.originalPropertyText = this.treeElement.property.propertyText;
        this.treeElement.parentPane().setEditingStyle(true);
        const uiLocation = Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding.instance().propertyUILocation(this.treeElement.property, false /* forName */);
        if (uiLocation) {
            void Common.Revealer.reveal(uiLocation, true /* omitFocus */);
        }
    }
    bezierChanged(event) {
        this.swatch.setBezierText(event.data);
        void this.treeElement.applyStyleText(this.treeElement.renderedPropertyText(), false);
    }
    onScroll(_event) {
        this.swatchPopoverHelper.hide(true);
    }
    onPopoverHidden(commitEdit) {
        if (this.scrollerElement) {
            this.scrollerElement.removeEventListener('scroll', this.boundOnScroll, false);
        }
        if (this.bezierEditor) {
            this.bezierEditor.removeEventListener(InlineEditor.BezierEditor.Events.BezierChanged, this.boundBezierChanged);
        }
        this.bezierEditor = undefined;
        const propertyText = commitEdit ? this.treeElement.renderedPropertyText() : this.originalPropertyText || '';
        void this.treeElement.applyStyleText(propertyText, true);
        this.treeElement.parentPane().setEditingStyle(false);
        delete this.originalPropertyText;
    }
}
export class ColorSwatchPopoverIcon {
    treeElement;
    swatchPopoverHelper;
    swatch;
    contrastInfo;
    boundSpectrumChanged;
    boundOnScroll;
    spectrum;
    scrollerElement;
    originalPropertyText;
    constructor(treeElement, swatchPopoverHelper, swatch) {
        this.treeElement = treeElement;
        this.swatchPopoverHelper = swatchPopoverHelper;
        this.swatch = swatch;
        this.swatch.addEventListener(InlineEditor.ColorSwatch.ClickEvent.eventName, this.iconClick.bind(this));
        this.contrastInfo = null;
        this.boundSpectrumChanged = this.spectrumChanged.bind(this);
        this.boundOnScroll = this.onScroll.bind(this);
    }
    generateCSSVariablesPalette() {
        const matchedStyles = this.treeElement.matchedStyles();
        const style = this.treeElement.property.ownerStyle;
        const cssVariables = matchedStyles.availableCSSVariables(style);
        const colors = [];
        const colorNames = [];
        for (const cssVariable of cssVariables) {
            if (cssVariable === this.treeElement.property.name) {
                continue;
            }
            const value = matchedStyles.computeCSSVariable(style, cssVariable);
            if (!value) {
                continue;
            }
            const color = Common.Color.Color.parse(value);
            if (!color) {
                continue;
            }
            colors.push(value);
            colorNames.push(cssVariable);
        }
        return { title: 'CSS Variables', mutable: false, matchUserFormat: true, colors: colors, colorNames: colorNames };
    }
    setContrastInfo(contrastInfo) {
        this.contrastInfo = contrastInfo;
    }
    iconClick(event) {
        event.consume(true);
        this.showPopover();
    }
    showPopover() {
        if (this.swatchPopoverHelper.isShowing()) {
            this.swatchPopoverHelper.hide(true);
            return;
        }
        const color = this.swatch.getColor();
        let format = this.swatch.getFormat();
        if (!color || !format) {
            return;
        }
        if (format === Common.Color.Format.Original) {
            format = color.format();
        }
        this.spectrum = new ColorPicker.Spectrum.Spectrum(this.contrastInfo);
        this.spectrum.setColor(color, format);
        this.spectrum.addPalette(this.generateCSSVariablesPalette());
        this.spectrum.addEventListener(ColorPicker.Spectrum.Events.SizeChanged, this.spectrumResized, this);
        this.spectrum.addEventListener(ColorPicker.Spectrum.Events.ColorChanged, this.boundSpectrumChanged);
        this.swatchPopoverHelper.show(this.spectrum, this.swatch, this.onPopoverHidden.bind(this));
        this.scrollerElement = this.swatch.enclosingNodeOrSelfWithClass('style-panes-wrapper');
        if (this.scrollerElement) {
            this.scrollerElement.addEventListener('scroll', this.boundOnScroll, false);
        }
        this.originalPropertyText = this.treeElement.property.propertyText;
        this.treeElement.parentPane().setEditingStyle(true);
        const uiLocation = Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding.instance().propertyUILocation(this.treeElement.property, false /* forName */);
        if (uiLocation) {
            void Common.Revealer.reveal(uiLocation, true /* omitFocus */);
        }
    }
    spectrumResized() {
        this.swatchPopoverHelper.reposition();
    }
    spectrumChanged(event) {
        const color = Common.Color.Color.parse(event.data);
        if (!color) {
            return;
        }
        const colorName = this.spectrum ? this.spectrum.colorName() : undefined;
        const text = colorName && colorName.startsWith('--') ? `var(${colorName})` : color.asString();
        this.swatch.renderColor(color);
        const value = this.swatch.firstElementChild;
        if (value) {
            value.remove();
            this.swatch.createChild('span').textContent = text;
        }
        void this.treeElement.applyStyleText(this.treeElement.renderedPropertyText(), false);
    }
    onScroll(_event) {
        this.swatchPopoverHelper.hide(true);
    }
    onPopoverHidden(commitEdit) {
        if (this.scrollerElement) {
            this.scrollerElement.removeEventListener('scroll', this.boundOnScroll, false);
        }
        if (this.spectrum) {
            this.spectrum.removeEventListener(ColorPicker.Spectrum.Events.ColorChanged, this.boundSpectrumChanged);
        }
        this.spectrum = undefined;
        const propertyText = commitEdit ? this.treeElement.renderedPropertyText() : this.originalPropertyText || '';
        void this.treeElement.applyStyleText(propertyText, true);
        this.treeElement.parentPane().setEditingStyle(false);
        delete this.originalPropertyText;
    }
}
export class ShadowSwatchPopoverHelper {
    treeElement;
    swatchPopoverHelper;
    shadowSwatch;
    iconElement;
    boundShadowChanged;
    boundOnScroll;
    cssShadowEditor;
    scrollerElement;
    originalPropertyText;
    constructor(treeElement, swatchPopoverHelper, shadowSwatch) {
        this.treeElement = treeElement;
        this.swatchPopoverHelper = swatchPopoverHelper;
        this.shadowSwatch = shadowSwatch;
        this.iconElement = shadowSwatch.iconElement();
        UI.Tooltip.Tooltip.install(this.iconElement, i18nString(UIStrings.openShadowEditor));
        this.iconElement.addEventListener('click', this.iconClick.bind(this), false);
        this.iconElement.addEventListener('mousedown', event => event.consume(), false);
        this.boundShadowChanged = this.shadowChanged.bind(this);
        this.boundOnScroll = this.onScroll.bind(this);
    }
    iconClick(event) {
        event.consume(true);
        this.showPopover();
    }
    showPopover() {
        if (this.swatchPopoverHelper.isShowing()) {
            this.swatchPopoverHelper.hide(true);
            return;
        }
        this.cssShadowEditor = new InlineEditor.CSSShadowEditor.CSSShadowEditor();
        this.cssShadowEditor.setModel(this.shadowSwatch.model());
        this.cssShadowEditor.addEventListener(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this.boundShadowChanged);
        this.swatchPopoverHelper.show(this.cssShadowEditor, this.iconElement, this.onPopoverHidden.bind(this));
        this.scrollerElement = this.iconElement.enclosingNodeOrSelfWithClass('style-panes-wrapper');
        if (this.scrollerElement) {
            this.scrollerElement.addEventListener('scroll', this.boundOnScroll, false);
        }
        this.originalPropertyText = this.treeElement.property.propertyText;
        this.treeElement.parentPane().setEditingStyle(true);
        const uiLocation = Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding.instance().propertyUILocation(this.treeElement.property, false /* forName */);
        if (uiLocation) {
            void Common.Revealer.reveal(uiLocation, true /* omitFocus */);
        }
    }
    shadowChanged(event) {
        this.shadowSwatch.setCSSShadow(event.data);
        void this.treeElement.applyStyleText(this.treeElement.renderedPropertyText(), false);
    }
    onScroll(_event) {
        this.swatchPopoverHelper.hide(true);
    }
    onPopoverHidden(commitEdit) {
        if (this.scrollerElement) {
            this.scrollerElement.removeEventListener('scroll', this.boundOnScroll, false);
        }
        if (this.cssShadowEditor) {
            this.cssShadowEditor.removeEventListener(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this.boundShadowChanged);
        }
        this.cssShadowEditor = undefined;
        const propertyText = commitEdit ? this.treeElement.renderedPropertyText() : this.originalPropertyText || '';
        void this.treeElement.applyStyleText(propertyText, true);
        this.treeElement.parentPane().setEditingStyle(false);
        delete this.originalPropertyText;
    }
}
export class FontEditorSectionManager {
    treeElementMap;
    swatchPopoverHelper;
    section;
    parentPane;
    fontEditor;
    scrollerElement;
    boundFontChanged;
    boundOnScroll;
    boundResized;
    constructor(swatchPopoverHelper, section) {
        this.treeElementMap = new Map();
        this.swatchPopoverHelper = swatchPopoverHelper;
        this.section = section;
        this.parentPane = null;
        this.fontEditor = null;
        this.scrollerElement = null;
        this.boundFontChanged = this.fontChanged.bind(this);
        this.boundOnScroll = this.onScroll.bind(this);
        this.boundResized = this.fontEditorResized.bind(this);
    }
    fontChanged(event) {
        const { propertyName, value } = event.data;
        const treeElement = this.treeElementMap.get(propertyName);
        void this.updateFontProperty(propertyName, value, treeElement);
    }
    async updateFontProperty(propertyName, value, treeElement) {
        if (treeElement && treeElement.treeOutline && treeElement.valueElement && treeElement.property.parsedOk &&
            treeElement.property.range) {
            let elementRemoved = false;
            treeElement.valueElement.textContent = value;
            treeElement.property.value = value;
            let styleText;
            const propertyName = treeElement.property.name;
            if (value.length) {
                styleText = treeElement.renderedPropertyText();
            }
            else {
                styleText = '';
                elementRemoved = true;
                this.fixIndex(treeElement.property.index);
            }
            this.treeElementMap.set(propertyName, treeElement);
            await treeElement.applyStyleText(styleText, true);
            if (elementRemoved) {
                this.treeElementMap.delete(propertyName);
            }
        }
        else if (value.length) {
            const newProperty = this.section.addNewBlankProperty();
            if (newProperty) {
                newProperty.property.name = propertyName;
                newProperty.property.value = value;
                newProperty.updateTitle();
                await newProperty.applyStyleText(newProperty.renderedPropertyText(), true);
                this.treeElementMap.set(newProperty.property.name, newProperty);
            }
        }
        this.section.onpopulate();
        this.swatchPopoverHelper.reposition();
        return;
    }
    fontEditorResized() {
        this.swatchPopoverHelper.reposition();
    }
    fixIndex(removedIndex) {
        for (const treeElement of this.treeElementMap.values()) {
            if (treeElement.property.index > removedIndex) {
                treeElement.property.index -= 1;
            }
        }
    }
    createPropertyValueMap() {
        const propertyMap = new Map();
        for (const fontProperty of this.treeElementMap) {
            const propertyName = fontProperty[0];
            const treeElement = fontProperty[1];
            if (treeElement.property.value.length) {
                propertyMap.set(propertyName, treeElement.property.value);
            }
            else {
                this.treeElementMap.delete(propertyName);
            }
        }
        return propertyMap;
    }
    registerFontProperty(treeElement) {
        const propertyName = treeElement.property.name;
        if (this.treeElementMap.has(propertyName)) {
            const treeElementFromMap = this.treeElementMap.get(propertyName);
            if (!treeElement.overloaded() || (treeElementFromMap && treeElementFromMap.overloaded())) {
                this.treeElementMap.set(propertyName, treeElement);
            }
        }
        else {
            this.treeElementMap.set(propertyName, treeElement);
        }
    }
    async showPopover(iconElement, parentPane) {
        if (this.swatchPopoverHelper.isShowing()) {
            this.swatchPopoverHelper.hide(true);
            return;
        }
        this.parentPane = parentPane;
        const propertyValueMap = this.createPropertyValueMap();
        this.fontEditor = new InlineEditor.FontEditor.FontEditor(propertyValueMap);
        this.fontEditor.addEventListener(InlineEditor.FontEditor.Events.FontChanged, this.boundFontChanged);
        this.fontEditor.addEventListener(InlineEditor.FontEditor.Events.FontEditorResized, this.boundResized);
        this.swatchPopoverHelper.show(this.fontEditor, iconElement, this.onPopoverHidden.bind(this));
        this.scrollerElement = iconElement.enclosingNodeOrSelfWithClass('style-panes-wrapper');
        if (this.scrollerElement) {
            this.scrollerElement.addEventListener('scroll', this.boundOnScroll, false);
        }
        this.parentPane.setEditingStyle(true);
    }
    onScroll() {
        this.swatchPopoverHelper.hide(true);
    }
    onPopoverHidden() {
        if (this.scrollerElement) {
            this.scrollerElement.removeEventListener('scroll', this.boundOnScroll, false);
        }
        this.section.onpopulate();
        if (this.fontEditor) {
            this.fontEditor.removeEventListener(InlineEditor.FontEditor.Events.FontChanged, this.boundFontChanged);
        }
        this.fontEditor = null;
        if (this.parentPane) {
            this.parentPane.setEditingStyle(false);
        }
        this.section.resetToolbars();
        this.section.onpopulate();
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static treeElementSymbol = Symbol('FontEditorSectionManager._treeElementSymbol');
}
//# sourceMappingURL=ColorSwatchPopoverIcon.js.map