// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../../../core/common/common.js';
import * as Host from '../../../../core/host/host.js';
import * as i18n from '../../../../core/i18n/i18n.js';
import * as LinearMemoryInspector from '../../../components/linear_memory_inspector/linear_memory_inspector.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as SDK from '../../../../core/sdk/sdk.js';
import * as TextUtils from '../../../../models/text_utils/text_utils.js';
import * as JavaScriptMetaData from '../../../../models/javascript_metadata/javascript_metadata.js';
import * as IconButton from '../../../components/icon_button/icon_button.js';
import * as TextEditor from '../../../components/text_editor/text_editor.js';
import * as UI from '../../legacy.js';
import { CustomPreviewComponent } from './CustomPreviewComponent.js';
import { JavaScriptREPL } from './JavaScriptREPL.js';
import { createSpansForNodeTitle, RemoteObjectPreviewFormatter } from './RemoteObjectPreviewFormatter.js';
import objectValueStyles from './objectValue.css.js';
import objectPropertiesSectionStyles from './objectPropertiesSection.css.js';
const UIStrings = {
    /**
    *@description Text in Object Properties Section
    *@example {function alert()  [native code] } PH1
    */
    exceptionS: '[Exception: {PH1}]',
    /**
    *@description Text in Object Properties Section
    */
    unknown: 'unknown',
    /**
    *@description Text to expand something recursively
    */
    expandRecursively: 'Expand recursively',
    /**
    *@description Text to collapse children of a parent group
    */
    collapseChildren: 'Collapse children',
    /**
    *@description Text in Object Properties Section
    */
    noProperties: 'No properties',
    /**
    *@description Element text content in Object Properties Section
    */
    dots: '(...)',
    /**
    *@description Element title in Object Properties Section
    */
    invokePropertyGetter: 'Invoke property getter',
    /**
    *@description Show all text content in Show More Data Grid Node of a data grid
    *@example {50} PH1
    */
    showAllD: 'Show all {PH1}',
    /**
    * @description Value element text content in Object Properties Section. Shown when the developer is
    * viewing a variable in the Scope view, whose value is not available (i.e. because it was optimized
    * out) by the JavaScript engine, or inspecting a JavaScript object accessor property, which has no
    * getter. This string should be translated.
    */
    valueUnavailable: '<value unavailable>',
    /**
     * @description Tooltip for value elements in the Scope view that refer to variables whose values
     * aren't accessible to the debugger (potentially due to being optimized out by the JavaScript
     * engine), or for JavaScript object accessor properties which have no getter.
     */
    valueNotAccessibleToTheDebugger: 'Value is not accessible to the debugger',
    /**
    *@description A context menu item in the Watch Expressions Sidebar Pane of the Sources panel and Network pane request.
    */
    copyValue: 'Copy value',
    /**
    *@description A context menu item in the Object Properties Section
    */
    copyPropertyPath: 'Copy property path',
    /**
    * @description Text shown when displaying a JavaScript object that has a string property that is
    * too large for DevTools to properly display a text editor. This is shown instead of the string in
    * question. Should be translated.
    */
    stringIsTooLargeToEdit: '<string is too large to edit>',
    /**
    *@description Text of attribute value when text is too long
    *@example {30 MB} PH1
    */
    showMoreS: 'Show more ({PH1})',
    /**
    *@description Text of attribute value when text is too long
    *@example {30 MB} PH1
    */
    longTextWasTruncatedS: 'long text was truncated ({PH1})',
    /**
    *@description Text for copying
    */
    copy: 'Copy',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/components/object_ui/ObjectPropertiesSection.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const EXPANDABLE_MAX_LENGTH = 50;
const EXPANDABLE_MAX_DEPTH = 100;
const parentMap = new WeakMap();
const objectPropertiesSectionMap = new WeakMap();
const domPinnedProperties = JavaScriptMetaData.JavaScriptMetadata.JavaScriptMetadataImpl.domPinnedProperties.DOMPinnedProperties;
export const getObjectPropertiesSectionFrom = (element) => {
    return objectPropertiesSectionMap.get(element);
};
export class ObjectPropertiesSection extends UI.TreeOutline.TreeOutlineInShadow {
    object;
    editable;
    objectTreeElementInternal;
    titleElement;
    skipProtoInternal;
    constructor(object, title, linkifier, showOverflow) {
        super();
        this.object = object;
        this.editable = true;
        if (!showOverflow) {
            this.hideOverflow();
        }
        this.setFocusable(true);
        this.setShowSelectionOnKeyboardFocus(true);
        this.objectTreeElementInternal = new RootElement(object, linkifier);
        this.appendChild(this.objectTreeElementInternal);
        if (typeof title === 'string' || !title) {
            this.titleElement = this.element.createChild('span');
            this.titleElement.textContent = title || '';
        }
        else {
            this.titleElement = title;
            this.element.appendChild(title);
        }
        if (this.titleElement instanceof HTMLElement && !this.titleElement.hasAttribute('tabIndex')) {
            this.titleElement.tabIndex = -1;
        }
        objectPropertiesSectionMap.set(this.element, this);
        this.registerCSSFiles([objectValueStyles, objectPropertiesSectionStyles]);
        this.rootElement().childrenListElement.classList.add('source-code', 'object-properties-section');
    }
    static defaultObjectPresentation(object, linkifier, skipProto, readOnly) {
        const objectPropertiesSection = ObjectPropertiesSection.defaultObjectPropertiesSection(object, linkifier, skipProto, readOnly);
        if (!object.hasChildren) {
            return objectPropertiesSection.titleElement;
        }
        return objectPropertiesSection.element;
    }
    static defaultObjectPropertiesSection(object, linkifier, skipProto, readOnly) {
        const titleElement = document.createElement('span');
        titleElement.classList.add('source-code');
        const shadowRoot = UI.Utils.createShadowRootWithCoreStyles(titleElement, {
            cssFile: [objectValueStyles],
            delegatesFocus: undefined,
        });
        const propertyValue = ObjectPropertiesSection.createPropertyValue(object, /* wasThrown */ false, /* showPreview */ true);
        shadowRoot.appendChild(propertyValue.element);
        const objectPropertiesSection = new ObjectPropertiesSection(object, titleElement, linkifier);
        objectPropertiesSection.editable = false;
        if (skipProto) {
            objectPropertiesSection.skipProto();
        }
        if (readOnly) {
            objectPropertiesSection.setEditable(false);
        }
        return objectPropertiesSection;
    }
    static assignWebIDLMetadata(value, properties) {
        if (!value) {
            return;
        }
        const isInstance = value.type === 'object' && value.className !== null;
        const webIdlType = isInstance ? domPinnedProperties[value.className] : undefined;
        if (webIdlType) {
            value.webIdl = { info: webIdlType, state: new Map() };
        }
        else {
            return;
        }
        for (const property of properties) {
            const webIdlProperty = webIdlType?.props?.[property.name];
            if (webIdlProperty) {
                property.webIdl = { info: webIdlProperty };
            }
        }
    }
    static getPropertyValuesByNames(properties) {
        const map = new Map();
        for (const property of properties) {
            map.set(property.name, property.value);
        }
        return map;
    }
    static compareProperties(propertyA, propertyB) {
        if (!propertyA.synthetic && propertyB.synthetic) {
            return 1;
        }
        if (!propertyB.synthetic && propertyA.synthetic) {
            return -1;
        }
        if (!propertyA.isOwn && propertyB.isOwn) {
            return 1;
        }
        if (!propertyB.isOwn && propertyA.isOwn) {
            return -1;
        }
        if (!propertyA.enumerable && propertyB.enumerable) {
            return 1;
        }
        if (!propertyB.enumerable && propertyA.enumerable) {
            return -1;
        }
        if (propertyA.symbol && !propertyB.symbol) {
            return 1;
        }
        if (propertyB.symbol && !propertyA.symbol) {
            return -1;
        }
        if (propertyA.private && !propertyB.private) {
            return 1;
        }
        if (propertyB.private && !propertyA.private) {
            return -1;
        }
        const a = propertyA.name;
        const b = propertyB.name;
        if (a.startsWith('_') && !b.startsWith('_')) {
            return 1;
        }
        if (b.startsWith('_') && !a.startsWith('_')) {
            return -1;
        }
        return Platform.StringUtilities.naturalOrderComparator(a, b);
    }
    static createNameElement(name, isPrivate) {
        if (name === null) {
            return UI.Fragment.html `<span class="name"></span>`;
        }
        if (/^\s|\s$|^$|\n/.test(name)) {
            return UI.Fragment.html `<span class="name">"${name.replace(/\n/g, '\u21B5')}"</span>`;
        }
        if (isPrivate) {
            return UI.Fragment.html `<span class="name">
  <span class="private-property-hash">${name[0]}</span>${name.substring(1)}
  </span>`;
        }
        return UI.Fragment.html `<span class="name">${name}</span>`;
    }
    static valueElementForFunctionDescription(description, includePreview, defaultName) {
        const valueElement = document.createElement('span');
        valueElement.classList.add('object-value-function');
        description = description || '';
        const text = description.replace(/^function [gs]et /, 'function ')
            .replace(/^function [gs]et\(/, 'function\(')
            .replace(/^[gs]et /, '');
        defaultName = defaultName || '';
        // This set of best-effort regular expressions captures common function descriptions.
        // Ideally, some parser would provide prefix, arguments, function body text separately.
        const asyncMatch = text.match(/^(async\s+function)/);
        const isGenerator = text.startsWith('function*');
        const isGeneratorShorthand = text.startsWith('*');
        const isBasic = !isGenerator && text.startsWith('function');
        const isClass = text.startsWith('class ') || text.startsWith('class{');
        const firstArrowIndex = text.indexOf('=>');
        const isArrow = !asyncMatch && !isGenerator && !isBasic && !isClass && firstArrowIndex > 0;
        let textAfterPrefix;
        if (isClass) {
            textAfterPrefix = text.substring('class'.length);
            const classNameMatch = /^[^{\s]+/.exec(textAfterPrefix.trim());
            let className = defaultName;
            if (classNameMatch) {
                className = classNameMatch[0].trim() || defaultName;
            }
            addElements('class', textAfterPrefix, className);
        }
        else if (asyncMatch) {
            textAfterPrefix = text.substring(asyncMatch[1].length);
            addElements('async \u0192', textAfterPrefix, nameAndArguments(textAfterPrefix));
        }
        else if (isGenerator) {
            textAfterPrefix = text.substring('function*'.length);
            addElements('\u0192*', textAfterPrefix, nameAndArguments(textAfterPrefix));
        }
        else if (isGeneratorShorthand) {
            textAfterPrefix = text.substring('*'.length);
            addElements('\u0192*', textAfterPrefix, nameAndArguments(textAfterPrefix));
        }
        else if (isBasic) {
            textAfterPrefix = text.substring('function'.length);
            addElements('\u0192', textAfterPrefix, nameAndArguments(textAfterPrefix));
        }
        else if (isArrow) {
            const maxArrowFunctionCharacterLength = 60;
            let abbreviation = text;
            if (defaultName) {
                abbreviation = defaultName + '()';
            }
            else if (text.length > maxArrowFunctionCharacterLength) {
                abbreviation = text.substring(0, firstArrowIndex + 2) + ' {…}';
            }
            addElements('', text, abbreviation);
        }
        else {
            addElements('\u0192', text, nameAndArguments(text));
        }
        UI.Tooltip.Tooltip.install(valueElement, Platform.StringUtilities.trimEndWithMaxLength(description, 500));
        return valueElement;
        function nameAndArguments(contents) {
            const startOfArgumentsIndex = contents.indexOf('(');
            const endOfArgumentsMatch = contents.match(/\)\s*{/);
            if (startOfArgumentsIndex !== -1 && endOfArgumentsMatch && endOfArgumentsMatch.index !== undefined &&
                endOfArgumentsMatch.index > startOfArgumentsIndex) {
                const name = contents.substring(0, startOfArgumentsIndex).trim() || defaultName;
                const args = contents.substring(startOfArgumentsIndex, endOfArgumentsMatch.index + 1);
                return name + args;
            }
            return defaultName + '()';
        }
        function addElements(prefix, body, abbreviation) {
            const maxFunctionBodyLength = 200;
            if (prefix.length) {
                valueElement.createChild('span', 'object-value-function-prefix').textContent = prefix + ' ';
            }
            if (includePreview) {
                UI.UIUtils.createTextChild(valueElement, Platform.StringUtilities.trimEndWithMaxLength(body.trim(), maxFunctionBodyLength));
            }
            else {
                UI.UIUtils.createTextChild(valueElement, abbreviation.replace(/\n/g, ' '));
            }
        }
    }
    static createPropertyValueWithCustomSupport(value, wasThrown, showPreview, parentElement, linkifier) {
        if (value.customPreview()) {
            const result = (new CustomPreviewComponent(value)).element;
            result.classList.add('object-properties-section-custom-section');
            return new ObjectPropertyValue(result);
        }
        return ObjectPropertiesSection.createPropertyValue(value, wasThrown, showPreview, parentElement, linkifier);
    }
    static appendMemoryIcon(element, obj) {
        // We show the memory icon only on ArrayBuffer, WebAssembly.Memory and DWARF memory instances.
        // TypedArrays DataViews are also supported, but showing the icon next to their
        // previews is quite a significant visual overhead, and users can easily get to
        // their buffers and open the memory inspector from there.
        const arrayBufferOrWasmMemory = (obj.type === 'object' && (obj.subtype === 'arraybuffer' || obj.subtype === 'webassemblymemory'));
        if (!arrayBufferOrWasmMemory && !LinearMemoryInspector.LinearMemoryInspectorController.isDWARFMemoryObject(obj)) {
            return;
        }
        const memoryIcon = new IconButton.Icon.Icon();
        memoryIcon.data = {
            iconName: 'ic_memory_16x16',
            color: 'var(--color-text-secondary)',
            width: '13px',
            height: '13px',
        };
        memoryIcon.onclick = async (event) => {
            event.stopPropagation();
            const controller = LinearMemoryInspector.LinearMemoryInspectorController.LinearMemoryInspectorController.instance();
            Host.userMetrics.linearMemoryInspectorRevealedFrom(Host.UserMetrics.LinearMemoryInspectorRevealedFrom.MemoryIcon);
            void controller.openInspectorView(obj);
        };
        UI.Tooltip.Tooltip.install(memoryIcon, 'Reveal in Memory Inspector panel');
        element.classList.add('object-value-with-memory-icon');
        element.appendChild(memoryIcon);
    }
    static createPropertyValue(value, wasThrown, showPreview, parentElement, linkifier) {
        let propertyValue;
        const type = value.type;
        const subtype = value.subtype;
        const description = value.description || '';
        const className = value.className;
        if (type === 'object' && subtype === 'internal#location') {
            const rawLocation = value.debuggerModel().createRawLocationByScriptId(value.value.scriptId, value.value.lineNumber, value.value.columnNumber);
            if (rawLocation && linkifier) {
                return new ObjectPropertyValue(linkifier.linkifyRawLocation(rawLocation, Platform.DevToolsPath.EmptyUrlString));
            }
            propertyValue = new ObjectPropertyValue(createUnknownInternalLocationElement());
        }
        else if (type === 'string' && typeof description === 'string') {
            propertyValue = createStringElement();
        }
        else if (type === 'object' && subtype === 'trustedtype') {
            propertyValue = createTrustedTypeElement();
        }
        else if (type === 'function') {
            propertyValue = new ObjectPropertyValue(ObjectPropertiesSection.valueElementForFunctionDescription(description));
        }
        else if (type === 'object' && subtype === 'node' && description) {
            propertyValue = new ObjectPropertyValue(createNodeElement());
        }
        else {
            const valueElement = document.createElement('span');
            valueElement.classList.add('object-value-' + (subtype || type));
            if (value.preview && showPreview) {
                const previewFormatter = new RemoteObjectPreviewFormatter();
                previewFormatter.appendObjectPreview(valueElement, value.preview, false /* isEntry */);
                propertyValue = new ObjectPropertyValue(valueElement);
                UI.Tooltip.Tooltip.install(propertyValue.element, description || '');
            }
            else if (description.length > maxRenderableStringLength) {
                propertyValue = new ExpandableTextPropertyValue(valueElement, description, EXPANDABLE_MAX_LENGTH);
            }
            else {
                propertyValue = new ObjectPropertyValue(valueElement);
                propertyValue.element.textContent = description;
                UI.Tooltip.Tooltip.install(propertyValue.element, description);
            }
            this.appendMemoryIcon(valueElement, value);
        }
        if (wasThrown) {
            const wrapperElement = document.createElement('span');
            wrapperElement.classList.add('error');
            wrapperElement.classList.add('value');
            wrapperElement.appendChild(i18n.i18n.getFormatLocalizedString(str_, UIStrings.exceptionS, { PH1: propertyValue.element }));
            propertyValue.element = wrapperElement;
        }
        propertyValue.element.classList.add('value');
        return propertyValue;
        function createUnknownInternalLocationElement() {
            const valueElement = document.createElement('span');
            valueElement.textContent = '<' + i18nString(UIStrings.unknown) + '>';
            UI.Tooltip.Tooltip.install(valueElement, description || '');
            return valueElement;
        }
        function createStringElement() {
            const valueElement = document.createElement('span');
            valueElement.classList.add('object-value-string');
            const text = JSON.stringify(description);
            let propertyValue;
            if (description.length > maxRenderableStringLength) {
                propertyValue = new ExpandableTextPropertyValue(valueElement, text, EXPANDABLE_MAX_LENGTH);
            }
            else {
                UI.UIUtils.createTextChild(valueElement, text);
                propertyValue = new ObjectPropertyValue(valueElement);
                UI.Tooltip.Tooltip.install(valueElement, description);
            }
            return propertyValue;
        }
        function createTrustedTypeElement() {
            const valueElement = document.createElement('span');
            valueElement.classList.add('object-value-trustedtype');
            const text = `${className} "${description}"`;
            let propertyValue;
            if (text.length > maxRenderableStringLength) {
                propertyValue = new ExpandableTextPropertyValue(valueElement, text, EXPANDABLE_MAX_LENGTH);
            }
            else {
                const contentString = createStringElement();
                UI.UIUtils.createTextChild(valueElement, `${className} `);
                valueElement.appendChild(contentString.element);
                propertyValue = new ObjectPropertyValue(valueElement);
                UI.Tooltip.Tooltip.install(valueElement, text);
            }
            return propertyValue;
        }
        function createNodeElement() {
            const valueElement = document.createElement('span');
            valueElement.classList.add('object-value-node');
            createSpansForNodeTitle(valueElement, description);
            valueElement.addEventListener('click', event => {
                void Common.Revealer.reveal(value);
                event.consume(true);
            }, false);
            valueElement.addEventListener('mousemove', () => SDK.OverlayModel.OverlayModel.highlightObjectAsDOMNode(value), false);
            valueElement.addEventListener('mouseleave', () => SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight(), false);
            return valueElement;
        }
    }
    static formatObjectAsFunction(func, element, linkify, includePreview) {
        return func.debuggerModel().functionDetailsPromise(func).then(didGetDetails);
        function didGetDetails(response) {
            if (linkify && response && response.location) {
                element.classList.add('linkified');
                element.addEventListener('click', () => {
                    void Common.Revealer.reveal(response.location);
                    return false;
                });
            }
            // The includePreview flag is false for formats such as console.dir().
            let defaultName = includePreview ? '' : 'anonymous';
            if (response && response.functionName) {
                defaultName = response.functionName;
            }
            const valueElement = ObjectPropertiesSection.valueElementForFunctionDescription(func.description, includePreview, defaultName);
            element.appendChild(valueElement);
        }
    }
    static isDisplayableProperty(property, parentProperty) {
        if (!parentProperty || !parentProperty.synthetic) {
            return true;
        }
        const name = property.name;
        const useless = (parentProperty.name === '[[Entries]]' && (name === 'length' || name === '__proto__'));
        return !useless;
    }
    skipProto() {
        this.skipProtoInternal = true;
    }
    expand() {
        this.objectTreeElementInternal.expand();
    }
    setEditable(value) {
        this.editable = value;
    }
    objectTreeElement() {
        return this.objectTreeElementInternal;
    }
    enableContextMenu() {
        this.element.addEventListener('contextmenu', this.contextMenuEventFired.bind(this), false);
    }
    contextMenuEventFired(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.appendApplicableItems(this.object);
        if (this.object instanceof SDK.RemoteObject.LocalJSONObject) {
            contextMenu.viewSection().appendItem(i18nString(UIStrings.expandRecursively), this.objectTreeElementInternal.expandRecursively.bind(this.objectTreeElementInternal, EXPANDABLE_MAX_DEPTH));
            contextMenu.viewSection().appendItem(i18nString(UIStrings.collapseChildren), this.objectTreeElementInternal.collapseChildren.bind(this.objectTreeElementInternal));
        }
        void contextMenu.show();
    }
    titleLessMode() {
        this.objectTreeElementInternal.listItemElement.classList.add('hidden');
        this.objectTreeElementInternal.childrenListElement.classList.add('title-less-mode');
        this.objectTreeElementInternal.expand();
    }
}
/** @const */
const ARRAY_LOAD_THRESHOLD = 100;
let maxRenderableStringLength = 10000;
export function setMaxRenderableStringLength(value) {
    maxRenderableStringLength = value;
}
export function getMaxRenderableStringLength() {
    return maxRenderableStringLength;
}
export class ObjectPropertiesSectionsTreeOutline extends UI.TreeOutline.TreeOutlineInShadow {
    editable;
    constructor(options) {
        super();
        this.registerCSSFiles([objectValueStyles, objectPropertiesSectionStyles]);
        this.editable = !(options && options.readOnly);
        this.contentElement.classList.add('source-code');
        this.contentElement.classList.add('object-properties-section');
        this.hideOverflow();
    }
}
export class RootElement extends UI.TreeOutline.TreeElement {
    object;
    linkifier;
    emptyPlaceholder;
    propertiesMode;
    extraProperties;
    targetObject;
    toggleOnClick;
    constructor(object, linkifier, emptyPlaceholder, propertiesMode = 1 /* OwnAndInternalAndInherited */, extraProperties = [], targetObject = object) {
        const contentElement = document.createElement('slot');
        super(contentElement);
        this.object = object;
        this.linkifier = linkifier;
        this.emptyPlaceholder = emptyPlaceholder;
        this.propertiesMode = propertiesMode;
        this.extraProperties = extraProperties;
        this.targetObject = targetObject;
        this.setExpandable(true);
        this.selectable = true;
        this.toggleOnClick = true;
        this.listItemElement.classList.add('object-properties-section-root-element');
        this.listItemElement.addEventListener('contextmenu', this.onContextMenu.bind(this), false);
    }
    onexpand() {
        if (this.treeOutline) {
            this.treeOutline.element.classList.add('expanded');
        }
    }
    oncollapse() {
        if (this.treeOutline) {
            this.treeOutline.element.classList.remove('expanded');
        }
    }
    ondblclick(_e) {
        return true;
    }
    onContextMenu(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.appendApplicableItems(this.object);
        if (this.object instanceof SDK.RemoteObject.LocalJSONObject) {
            const { value } = this.object;
            const propertyValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
            const copyValueHandler = () => {
                Host.userMetrics.actionTaken(Host.UserMetrics.Action.NetworkPanelCopyValue);
                Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(propertyValue);
            };
            contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyValue), copyValueHandler);
        }
        contextMenu.viewSection().appendItem(i18nString(UIStrings.expandRecursively), this.expandRecursively.bind(this, EXPANDABLE_MAX_DEPTH));
        contextMenu.viewSection().appendItem(i18nString(UIStrings.collapseChildren), this.collapseChildren.bind(this));
        void contextMenu.show();
    }
    async onpopulate() {
        const treeOutline = this.treeOutline;
        const skipProto = treeOutline ? Boolean(treeOutline.skipProtoInternal) : false;
        return ObjectPropertyTreeElement.populate(this, this.object, skipProto, false, this.linkifier, this.emptyPlaceholder, this.propertiesMode, this.extraProperties, this.targetObject);
    }
}
// Number of initially visible children in an ObjectPropertyTreeElement.
// Remaining children are shown as soon as requested via a show more properties button.
export const InitialVisibleChildrenLimit = 200;
export class ObjectPropertyTreeElement extends UI.TreeOutline.TreeElement {
    property;
    toggleOnClick;
    highlightChanges;
    linkifier;
    maxNumPropertiesToShow;
    nameElement;
    valueElement;
    rowContainer;
    readOnly;
    prompt;
    editableDiv;
    propertyValue;
    expandedValueElement;
    constructor(property, linkifier) {
        // Pass an empty title, the title gets made later in onattach.
        super();
        this.property = property;
        this.toggleOnClick = true;
        this.highlightChanges = [];
        this.linkifier = linkifier;
        this.maxNumPropertiesToShow = InitialVisibleChildrenLimit;
        this.listItemElement.addEventListener('contextmenu', this.contextMenuFired.bind(this), false);
        this.listItemElement.dataset.objectPropertyNameForTest = property.name;
        this.setExpandRecursively(property.name !== '[[Prototype]]');
    }
    static async populate(treeElement, value, skipProto, skipGettersAndSetters, linkifier, emptyPlaceholder, propertiesMode = 1 /* OwnAndInternalAndInherited */, extraProperties, targetValue) {
        if (value.arrayLength() > ARRAY_LOAD_THRESHOLD) {
            treeElement.removeChildren();
            void ArrayGroupingTreeElement.populateArray(treeElement, value, 0, value.arrayLength() - 1, linkifier);
            return;
        }
        let properties, internalProperties = null;
        switch (propertiesMode) {
            case 0 /* All */:
                ({ properties } = await value.getAllProperties(false /* accessorPropertiesOnly */, true /* generatePreview */));
                break;
            case 1 /* OwnAndInternalAndInherited */:
                ({ properties, internalProperties } =
                    await SDK.RemoteObject.RemoteObject.loadFromObjectPerProto(value, true /* generatePreview */));
                break;
        }
        treeElement.removeChildren();
        if (!properties) {
            return;
        }
        if (extraProperties !== undefined) {
            properties.push(...extraProperties);
        }
        ObjectPropertyTreeElement.populateWithProperties(treeElement, properties, internalProperties, skipProto, skipGettersAndSetters, targetValue || value, linkifier, emptyPlaceholder);
    }
    static populateWithProperties(treeNode, properties, internalProperties, skipProto, skipGettersAndSetters, value, linkifier, emptyPlaceholder) {
        ObjectPropertiesSection.assignWebIDLMetadata(value, properties);
        const names = ObjectPropertiesSection.getPropertyValuesByNames(properties);
        if (value?.webIdl) {
            const parentRules = value.webIdl.info.rules;
            if (parentRules) {
                for (const { when: name, is: expected } of parentRules) {
                    if (names.get(name)?.value === expected) {
                        value.webIdl.state.set(name, expected);
                    }
                }
            }
            for (const property of properties) {
                if (property.webIdl) {
                    const parentState = value.webIdl.state;
                    const propertyRules = property.webIdl.info.rules;
                    if (!parentRules && !propertyRules) {
                        property.webIdl.applicable = true;
                    }
                    else {
                        property.webIdl.applicable =
                            !propertyRules || propertyRules?.some(rule => parentState.get(rule.when) === rule.is);
                    }
                }
            }
        }
        properties.sort(ObjectPropertiesSection.compareProperties);
        internalProperties = internalProperties || [];
        const entriesProperty = internalProperties.find(property => property.name === '[[Entries]]');
        if (entriesProperty) {
            parentMap.set(entriesProperty, value);
            const treeElement = new ObjectPropertyTreeElement(entriesProperty, linkifier);
            treeElement.setExpandable(true);
            treeElement.expand();
            treeNode.appendChild(treeElement);
        }
        const tailProperties = [];
        for (let i = 0; i < properties.length; ++i) {
            const property = properties[i];
            parentMap.set(property, value);
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!ObjectPropertiesSection.isDisplayableProperty(property, treeNode.property)) {
                continue;
            }
            if (property.isOwn && !skipGettersAndSetters) {
                if (property.getter) {
                    const getterProperty = new SDK.RemoteObject.RemoteObjectProperty('get ' + property.name, property.getter, false);
                    parentMap.set(getterProperty, value);
                    tailProperties.push(getterProperty);
                }
                if (property.setter) {
                    const setterProperty = new SDK.RemoteObject.RemoteObjectProperty('set ' + property.name, property.setter, false);
                    parentMap.set(setterProperty, value);
                    tailProperties.push(setterProperty);
                }
            }
            const canShowProperty = property.getter || !property.isAccessorProperty();
            if (canShowProperty) {
                const element = new ObjectPropertyTreeElement(property, linkifier);
                if (property.name === 'memories' && property.value?.className === 'Memories') {
                    element.updateExpandable();
                    if (element.isExpandable()) {
                        element.expand();
                    }
                }
                treeNode.appendChild(element);
            }
        }
        for (let i = 0; i < tailProperties.length; ++i) {
            treeNode.appendChild(new ObjectPropertyTreeElement(tailProperties[i], linkifier));
        }
        for (const property of internalProperties) {
            parentMap.set(property, value);
            const treeElement = new ObjectPropertyTreeElement(property, linkifier);
            if (property.name === '[[Entries]]') {
                continue;
            }
            if (property.name === '[[Prototype]]' && skipProto) {
                continue;
            }
            treeNode.appendChild(treeElement);
        }
        ObjectPropertyTreeElement.appendEmptyPlaceholderIfNeeded(treeNode, emptyPlaceholder);
    }
    static appendEmptyPlaceholderIfNeeded(treeNode, emptyPlaceholder) {
        if (treeNode.childCount()) {
            return;
        }
        const title = document.createElement('div');
        title.classList.add('gray-info-message');
        title.textContent = emptyPlaceholder || i18nString(UIStrings.noProperties);
        const infoElement = new UI.TreeOutline.TreeElement(title);
        treeNode.appendChild(infoElement);
    }
    static createRemoteObjectAccessorPropertySpan(object, propertyPath, callback) {
        const rootElement = document.createElement('span');
        const element = rootElement.createChild('span');
        element.textContent = i18nString(UIStrings.dots);
        if (!object) {
            return rootElement;
        }
        element.classList.add('object-value-calculate-value-button');
        UI.Tooltip.Tooltip.install(element, i18nString(UIStrings.invokePropertyGetter));
        element.addEventListener('click', onInvokeGetterClick, false);
        function onInvokeGetterClick(event) {
            event.consume();
            if (object) {
                // The definition of callFunction expects an unknown, and setting to `any` causes Closure to fail.
                // However, leaving this as unknown also causes TypeScript to fail, so for now we leave this as unchecked.
                // @ts-ignore  TODO(crbug.com/1011811): Fix after Closure is removed.
                void object.callFunction(invokeGetter, [{ value: JSON.stringify(propertyPath) }]).then(callback);
            }
        }
        function invokeGetter(arrayStr) {
            let result = this;
            const properties = JSON.parse(arrayStr);
            for (let i = 0, n = properties.length; i < n; ++i) {
                // @ts-ignore callFunction expects this to be a generic Object, so while this works we can't be more specific on types.
                result = result[properties[i]];
            }
            return result;
        }
        return rootElement;
    }
    setSearchRegex(regex, additionalCssClassName) {
        let cssClasses = UI.UIUtils.highlightedSearchResultClassName;
        if (additionalCssClassName) {
            cssClasses += ' ' + additionalCssClassName;
        }
        this.revertHighlightChanges();
        this.applySearch(regex, this.nameElement, cssClasses);
        if (this.property.value) {
            const valueType = this.property.value.type;
            if (valueType !== 'object') {
                this.applySearch(regex, this.valueElement, cssClasses);
            }
        }
        return Boolean(this.highlightChanges.length);
    }
    applySearch(regex, element, cssClassName) {
        const ranges = [];
        const content = element.textContent || '';
        regex.lastIndex = 0;
        let match = regex.exec(content);
        while (match) {
            ranges.push(new TextUtils.TextRange.SourceRange(match.index, match[0].length));
            match = regex.exec(content);
        }
        if (ranges.length) {
            UI.UIUtils.highlightRangesWithStyleClass(element, ranges, cssClassName, this.highlightChanges);
        }
    }
    showAllPropertiesElementSelected(element) {
        this.removeChild(element);
        this.children().forEach(x => {
            x.hidden = false;
        });
        return false;
    }
    createShowAllPropertiesButton() {
        const element = document.createElement('div');
        element.classList.add('object-value-calculate-value-button');
        element.textContent = i18nString(UIStrings.dots);
        UI.Tooltip.Tooltip.install(element, i18nString(UIStrings.showAllD, { PH1: this.childCount() }));
        const children = this.children();
        for (let i = this.maxNumPropertiesToShow; i < this.childCount(); ++i) {
            children[i].hidden = true;
        }
        const showAllPropertiesButton = new UI.TreeOutline.TreeElement(element);
        showAllPropertiesButton.onselect = this.showAllPropertiesElementSelected.bind(this, showAllPropertiesButton);
        this.appendChild(showAllPropertiesButton);
    }
    revertHighlightChanges() {
        UI.UIUtils.revertDomChanges(this.highlightChanges);
        this.highlightChanges = [];
    }
    async onpopulate() {
        const propertyValue = this.property.value;
        console.assert(typeof propertyValue !== 'undefined');
        const treeOutline = this.treeOutline;
        const skipProto = treeOutline ? Boolean(treeOutline.skipProtoInternal) : false;
        const targetValue = this.property.name !== '[[Prototype]]' ? propertyValue : parentMap.get(this.property);
        if (targetValue) {
            await ObjectPropertyTreeElement.populate(this, propertyValue, skipProto, false, this.linkifier, undefined, undefined, undefined, targetValue);
            if (this.childCount() > this.maxNumPropertiesToShow) {
                this.createShowAllPropertiesButton();
            }
        }
    }
    ondblclick(event) {
        const target = event.target;
        const inEditableElement = target.isSelfOrDescendant(this.valueElement) ||
            (this.expandedValueElement && target.isSelfOrDescendant(this.expandedValueElement));
        if (this.property.value && !this.property.value.customPreview() && inEditableElement &&
            (this.property.writable || this.property.setter)) {
            this.startEditing();
        }
        return false;
    }
    onenter() {
        if (this.property.value && !this.property.value.customPreview() &&
            (this.property.writable || this.property.setter)) {
            this.startEditing();
            return true;
        }
        return false;
    }
    onattach() {
        this.update();
        this.updateExpandable();
    }
    onexpand() {
        this.showExpandedValueElement(true);
    }
    oncollapse() {
        this.showExpandedValueElement(false);
    }
    showExpandedValueElement(value) {
        if (!this.expandedValueElement) {
            return;
        }
        if (value) {
            this.rowContainer.replaceChild(this.expandedValueElement, this.valueElement);
        }
        else {
            this.rowContainer.replaceChild(this.valueElement, this.expandedValueElement);
        }
    }
    createExpandedValueElement(value) {
        const needsAlternateValue = value.hasChildren && !value.customPreview() && value.subtype !== 'node' &&
            value.type !== 'function' && (value.type !== 'object' || value.preview);
        if (!needsAlternateValue) {
            return null;
        }
        const valueElement = document.createElement('span');
        valueElement.classList.add('value');
        if (value.description === 'Object') {
            valueElement.textContent = '';
        }
        else {
            valueElement.setTextContentTruncatedIfNeeded(value.description || '');
        }
        valueElement.classList.add('object-value-' + (value.subtype || value.type));
        UI.Tooltip.Tooltip.install(valueElement, value.description || '');
        ObjectPropertiesSection.appendMemoryIcon(valueElement, value);
        return valueElement;
    }
    update() {
        this.nameElement =
            ObjectPropertiesSection.createNameElement(this.property.name, this.property.private);
        if (!this.property.enumerable) {
            this.nameElement.classList.add('object-properties-section-dimmed');
        }
        if (this.property.isOwn) {
            this.nameElement.classList.add('own-property');
        }
        if (this.property.synthetic) {
            this.nameElement.classList.add('synthetic-property');
        }
        this.updatePropertyPath();
        const isInternalEntries = this.property.synthetic && this.property.name === '[[Entries]]';
        if (isInternalEntries) {
            this.valueElement = document.createElement('span');
            this.valueElement.classList.add('value');
        }
        else if (this.property.value) {
            const showPreview = this.property.name !== '[[Prototype]]';
            this.propertyValue = ObjectPropertiesSection.createPropertyValueWithCustomSupport(this.property.value, this.property.wasThrown, showPreview, this.listItemElement, this.linkifier);
            this.valueElement = this.propertyValue.element;
        }
        else if (this.property.getter) {
            this.valueElement = document.createElement('span');
            const element = this.valueElement.createChild('span');
            element.textContent = i18nString(UIStrings.dots);
            element.classList.add('object-value-calculate-value-button');
            UI.Tooltip.Tooltip.install(element, i18nString(UIStrings.invokePropertyGetter));
            const object = parentMap.get(this.property);
            const getter = this.property.getter;
            element.addEventListener('click', (event) => {
                event.consume();
                const invokeGetter = `
          function invokeGetter(getter) {
            return Reflect.apply(getter, this, []);
          }`;
                // @ts-ignore No way to teach TypeScript to preserve the Function-ness of `getter`.
                // Also passing a string instead of a Function to avoid coverage implementation messing with it.
                void object.callFunction(invokeGetter, [SDK.RemoteObject.RemoteObject.toCallArgument(getter)])
                    .then(this.onInvokeGetterClick.bind(this));
            }, false);
        }
        else {
            this.valueElement = document.createElement('span');
            this.valueElement.classList.add('object-value-unavailable');
            this.valueElement.textContent = i18nString(UIStrings.valueUnavailable);
            UI.Tooltip.Tooltip.install(this.valueElement, i18nString(UIStrings.valueNotAccessibleToTheDebugger));
        }
        const valueText = this.valueElement.textContent;
        if (this.property.value && valueText && !this.property.wasThrown) {
            this.expandedValueElement = this.createExpandedValueElement(this.property.value);
        }
        let adorner = '';
        let container;
        if (this.property.webIdl?.applicable) {
            const icon = new IconButton.Icon.Icon();
            icon.data = {
                iconName: 'elements_panel_icon',
                color: 'var(--color-text-secondary)',
                width: '16px',
                height: '16px',
            };
            adorner = UI.Fragment.html `
         <span class='adorner'>${icon}</span>
       `;
        }
        if (isInternalEntries) {
            container = UI.Fragment.html `
        <span class='name-and-value'>${adorner}${this.nameElement}</span>
      `;
        }
        else {
            container = UI.Fragment.html `
        <span class='name-and-value'>${adorner}${this.nameElement}: ${this.valueElement}</span>
      `;
        }
        this.listItemElement.removeChildren();
        this.rowContainer = container;
        this.listItemElement.appendChild(this.rowContainer);
        this.listItemElement.dataset.webidl = this.property.webIdl?.applicable ? 'true' : 'false';
    }
    updatePropertyPath() {
        if (this.nameElement.title) {
            return;
        }
        const name = this.property.name;
        if (this.property.synthetic) {
            UI.Tooltip.Tooltip.install(this.nameElement, name);
            return;
        }
        // https://tc39.es/ecma262/#prod-IdentifierName
        const useDotNotation = /^(?:[$_\p{ID_Start}])(?:[$_\u200C\u200D\p{ID_Continue}])*$/u;
        const isInteger = /^(?:0|[1-9]\d*)$/;
        const parentPath = (this.parent instanceof ObjectPropertyTreeElement && this.parent.nameElement &&
            !this.parent.property.synthetic) ?
            this.parent.nameElement.title :
            '';
        if (this.property.private || useDotNotation.test(name)) {
            UI.Tooltip.Tooltip.install(this.nameElement, parentPath ? `${parentPath}.${name}` : name);
        }
        else if (isInteger.test(name)) {
            UI.Tooltip.Tooltip.install(this.nameElement, `${parentPath}[${name}]`);
        }
        else {
            UI.Tooltip.Tooltip.install(this.nameElement, `${parentPath}[${JSON.stringify(name)}]`);
        }
    }
    contextMenuFired(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.appendApplicableItems(this);
        if (this.property.symbol) {
            contextMenu.appendApplicableItems(this.property.symbol);
        }
        if (this.property.value) {
            contextMenu.appendApplicableItems(this.property.value);
            if (parentMap.get(this.property) instanceof SDK.RemoteObject.LocalJSONObject) {
                const { value: { value } } = this.property;
                const propertyValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
                const copyValueHandler = () => {
                    Host.userMetrics.actionTaken(Host.UserMetrics.Action.NetworkPanelCopyValue);
                    Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(propertyValue);
                };
                contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyValue), copyValueHandler);
            }
        }
        if (!this.property.synthetic && this.nameElement && this.nameElement.title) {
            const copyPathHandler = Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText.bind(Host.InspectorFrontendHost.InspectorFrontendHostInstance, this.nameElement.title);
            contextMenu.clipboardSection().appendItem(i18nString(UIStrings.copyPropertyPath), copyPathHandler);
        }
        if (parentMap.get(this.property) instanceof SDK.RemoteObject.LocalJSONObject) {
            contextMenu.viewSection().appendItem(i18nString(UIStrings.expandRecursively), this.expandRecursively.bind(this, EXPANDABLE_MAX_DEPTH));
            contextMenu.viewSection().appendItem(i18nString(UIStrings.collapseChildren), this.collapseChildren.bind(this));
        }
        if (this.propertyValue) {
            this.propertyValue.appendApplicableItems(event, contextMenu, {});
        }
        void contextMenu.show();
    }
    startEditing() {
        const treeOutline = this.treeOutline;
        if (this.prompt || !treeOutline || !treeOutline.editable || this.readOnly) {
            return;
        }
        this.editableDiv = this.rowContainer.createChild('span', 'editable-div');
        if (this.property.value) {
            let text = this.property.value.description;
            if (this.property.value.type === 'string' && typeof text === 'string') {
                text = `"${text}"`;
            }
            this.editableDiv.setTextContentTruncatedIfNeeded(text, i18nString(UIStrings.stringIsTooLargeToEdit));
        }
        const originalContent = this.editableDiv.textContent || '';
        // Lie about our children to prevent expanding on double click and to collapse subproperties.
        this.setExpandable(false);
        this.listItemElement.classList.add('editing-sub-part');
        this.valueElement.classList.add('hidden');
        this.prompt = new ObjectPropertyPrompt();
        const proxyElement = this.prompt.attachAndStartEditing(this.editableDiv, this.editingCommitted.bind(this, originalContent));
        proxyElement.classList.add('property-prompt');
        const selection = this.listItemElement.getComponentSelection();
        if (selection) {
            selection.selectAllChildren(this.editableDiv);
        }
        proxyElement.addEventListener('keydown', this.promptKeyDown.bind(this, originalContent), false);
    }
    editingEnded() {
        if (this.prompt) {
            this.prompt.detach();
            delete this.prompt;
        }
        this.editableDiv.remove();
        this.updateExpandable();
        this.listItemElement.scrollLeft = 0;
        this.listItemElement.classList.remove('editing-sub-part');
        this.select();
    }
    editingCancelled() {
        this.valueElement.classList.remove('hidden');
        this.editingEnded();
    }
    async editingCommitted(originalContent) {
        const userInput = this.prompt ? this.prompt.text() : '';
        if (userInput === originalContent) {
            this.editingCancelled(); // nothing changed, so cancel
            return;
        }
        this.editingEnded();
        await this.applyExpression(userInput);
    }
    promptKeyDown(originalContent, event) {
        const keyboardEvent = event;
        if (keyboardEvent.key === 'Enter') {
            keyboardEvent.consume();
            void this.editingCommitted(originalContent);
            return;
        }
        if (keyboardEvent.key === Platform.KeyboardUtilities.ESCAPE_KEY) {
            keyboardEvent.consume();
            this.editingCancelled();
            return;
        }
    }
    async applyExpression(expression) {
        const property = SDK.RemoteObject.RemoteObject.toCallArgument(this.property.symbol || this.property.name);
        expression = JavaScriptREPL.wrapObjectLiteral(expression.trim());
        if (this.property.synthetic) {
            let invalidate = false;
            if (expression) {
                invalidate = await this.property.setSyntheticValue(expression);
            }
            if (invalidate) {
                const parent = this.parent;
                if (parent) {
                    parent.invalidateChildren();
                    void parent.onpopulate();
                }
            }
            else {
                this.update();
            }
            return;
        }
        const parentObject = parentMap.get(this.property);
        const errorPromise = expression ? parentObject.setPropertyValue(property, expression) : parentObject.deleteProperty(property);
        const error = await errorPromise;
        if (error) {
            this.update();
            return;
        }
        if (!expression) {
            // The property was deleted, so remove this tree element.
            this.parent && this.parent.removeChild(this);
        }
        else {
            // Call updateSiblings since their value might be based on the value that just changed.
            const parent = this.parent;
            if (parent) {
                parent.invalidateChildren();
                void parent.onpopulate();
            }
        }
    }
    onInvokeGetterClick(result) {
        if (!result.object) {
            return;
        }
        this.property.value = result.object;
        this.property.wasThrown = result.wasThrown || false;
        this.update();
        this.invalidateChildren();
        this.updateExpandable();
    }
    updateExpandable() {
        if (this.property.value) {
            this.setExpandable(!this.property.value.customPreview() && this.property.value.hasChildren && !this.property.wasThrown);
        }
        else {
            this.setExpandable(false);
        }
    }
    path() {
        return this.nameElement.title;
    }
}
export class ArrayGroupingTreeElement extends UI.TreeOutline.TreeElement {
    toggleOnClick;
    fromIndex;
    toIndex;
    object;
    readOnly;
    propertyCount;
    linkifier;
    constructor(object, fromIndex, toIndex, propertyCount, linkifier) {
        super(Platform.StringUtilities.sprintf('[%d … %d]', fromIndex, toIndex), true);
        this.toggleOnClick = true;
        this.fromIndex = fromIndex;
        this.toIndex = toIndex;
        this.object = object;
        this.readOnly = true;
        this.propertyCount = propertyCount;
        this.linkifier = linkifier;
    }
    static async populateArray(treeNode, object, fromIndex, toIndex, linkifier) {
        await ArrayGroupingTreeElement.populateRanges(treeNode, object, fromIndex, toIndex, true, linkifier);
    }
    static async populateRanges(treeNode, object, fromIndex, toIndex, topLevel, linkifier) {
        // The definition of callFunctionJSON expects an unknown, and setting to `any` causes Closure to fail.
        // However, leaving this as unknown also causes TypeScript to fail, so for now we leave this as unchecked.
        // @ts-ignore  TODO(crbug.com/1011811): Fix after Closure is removed.
        const jsonValue = await object.callFunctionJSON(packRanges, [
            { value: fromIndex },
            { value: toIndex },
            { value: ArrayGroupingTreeElement.bucketThreshold },
            { value: ArrayGroupingTreeElement.sparseIterationThreshold },
        ]);
        await callback(jsonValue);
        /**
         * Note: must declare params as optional.
         */
        function packRanges(fromIndex, toIndex, bucketThreshold, sparseIterationThreshold) {
            if (fromIndex === undefined || toIndex === undefined || sparseIterationThreshold === undefined ||
                bucketThreshold === undefined) {
                return;
            }
            let ownPropertyNames = null;
            const consecutiveRange = (toIndex - fromIndex >= sparseIterationThreshold) && ArrayBuffer.isView(this);
            function* arrayIndexes(object) {
                if (fromIndex === undefined || toIndex === undefined || sparseIterationThreshold === undefined) {
                    return;
                }
                if (toIndex - fromIndex < sparseIterationThreshold) {
                    for (let i = fromIndex; i <= toIndex; ++i) {
                        if (i in object) {
                            yield i;
                        }
                    }
                }
                else {
                    ownPropertyNames = ownPropertyNames || Object.getOwnPropertyNames(object);
                    for (let i = 0; i < ownPropertyNames.length; ++i) {
                        const name = ownPropertyNames[i];
                        const index = Number(name) >>> 0;
                        if ((String(index)) === name && fromIndex <= index && index <= toIndex) {
                            yield index;
                        }
                    }
                }
            }
            let count = 0;
            if (consecutiveRange) {
                count = toIndex - fromIndex + 1;
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const ignored of arrayIndexes(this)) {
                    ++count;
                }
            }
            let bucketSize = count;
            if (count <= bucketThreshold) {
                bucketSize = count;
            }
            else {
                bucketSize = Math.pow(bucketThreshold, Math.ceil(Math.log(count) / Math.log(bucketThreshold)) - 1);
            }
            const ranges = [];
            if (consecutiveRange) {
                for (let i = fromIndex; i <= toIndex; i += bucketSize) {
                    const groupStart = i;
                    let groupEnd = groupStart + bucketSize - 1;
                    if (groupEnd > toIndex) {
                        groupEnd = toIndex;
                    }
                    ranges.push([groupStart, groupEnd, groupEnd - groupStart + 1]);
                }
            }
            else {
                count = 0;
                let groupStart = -1;
                let groupEnd = 0;
                for (const i of arrayIndexes(this)) {
                    if (groupStart === -1) {
                        groupStart = i;
                    }
                    groupEnd = i;
                    if (++count === bucketSize) {
                        ranges.push([groupStart, groupEnd, count]);
                        count = 0;
                        groupStart = -1;
                    }
                }
                if (count > 0) {
                    ranges.push([groupStart, groupEnd, count]);
                }
            }
            return { ranges: ranges };
        }
        async function callback(result) {
            if (!result) {
                return;
            }
            const ranges = result.ranges;
            if (ranges.length === 1) {
                // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
                // @ts-ignore
                await ArrayGroupingTreeElement.populateAsFragment(treeNode, object, ranges[0][0], ranges[0][1], linkifier);
            }
            else {
                for (let i = 0; i < ranges.length; ++i) {
                    const fromIndex = ranges[i][0];
                    const toIndex = ranges[i][1];
                    const count = ranges[i][2];
                    if (fromIndex === toIndex) {
                        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
                        // @ts-ignore
                        await ArrayGroupingTreeElement.populateAsFragment(treeNode, object, fromIndex, toIndex, linkifier);
                    }
                    else {
                        treeNode.appendChild(new ArrayGroupingTreeElement(object, fromIndex, toIndex, count, linkifier));
                    }
                }
            }
            if (topLevel) {
                // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
                // @ts-ignore
                await ArrayGroupingTreeElement.populateNonIndexProperties(treeNode, object, linkifier);
            }
        }
    }
    static async populateAsFragment(treeNode, object, fromIndex, toIndex, linkifier) {
        // The definition of callFunction expects an unknown, and setting to `any` causes Closure to fail.
        // However, leaving this as unknown also causes TypeScript to fail, so for now we leave this as unchecked.
        const result = await object.callFunction(
        // @ts-ignore  TODO(crbug.com/1011811): Fix after Closure is removed.
        buildArrayFragment, [{ value: fromIndex }, { value: toIndex }, { value: ArrayGroupingTreeElement.sparseIterationThreshold }]);
        if (!result.object || result.wasThrown) {
            return;
        }
        const arrayFragment = result.object;
        const allProperties = await arrayFragment.getAllProperties(false /* accessorPropertiesOnly */, true /* generatePreview */);
        arrayFragment.release();
        const properties = allProperties.properties;
        if (!properties) {
            return;
        }
        properties.sort(ObjectPropertiesSection.compareProperties);
        for (let i = 0; i < properties.length; ++i) {
            parentMap.set(properties[i], this.object);
            const childTreeElement = new ObjectPropertyTreeElement(properties[i], linkifier);
            childTreeElement.readOnly = true;
            treeNode.appendChild(childTreeElement);
        }
        function buildArrayFragment(
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fromIndex, toIndex, sparseIterationThreshold) {
            const result = Object.create(null);
            if (fromIndex === undefined || toIndex === undefined || sparseIterationThreshold === undefined) {
                return;
            }
            if (toIndex - fromIndex < sparseIterationThreshold) {
                for (let i = fromIndex; i <= toIndex; ++i) {
                    if (i in this) {
                        result[i] = this[i];
                    }
                }
            }
            else {
                const ownPropertyNames = Object.getOwnPropertyNames(this);
                for (let i = 0; i < ownPropertyNames.length; ++i) {
                    const name = ownPropertyNames[i];
                    const index = Number(name) >>> 0;
                    if (String(index) === name && fromIndex <= index && index <= toIndex) {
                        result[index] = this[index];
                    }
                }
            }
            return result;
        }
    }
    static async populateNonIndexProperties(treeNode, object, linkifier) {
        const { properties, internalProperties } = await SDK.RemoteObject.RemoteObject.loadFromObjectPerProto(object, true /* generatePreview */, true /* nonIndexedPropertiesOnly */);
        if (!properties) {
            return;
        }
        ObjectPropertyTreeElement.populateWithProperties(treeNode, properties, internalProperties, false, false, object, linkifier);
    }
    async onpopulate() {
        if (this.propertyCount >= ArrayGroupingTreeElement.bucketThreshold) {
            await ArrayGroupingTreeElement.populateRanges(this, this.object, this.fromIndex, this.toIndex, false, this.linkifier);
            return;
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // @ts-ignore
        await ArrayGroupingTreeElement.populateAsFragment(this, this.object, this.fromIndex, this.toIndex, this.linkifier);
    }
    onattach() {
        this.listItemElement.classList.add('object-properties-section-name');
    }
    static bucketThreshold = 100;
    static sparseIterationThreshold = 250000;
}
export class ObjectPropertyPrompt extends UI.TextPrompt.TextPrompt {
    constructor() {
        super();
        this.initialize(TextEditor.JavaScript.completeInContext);
    }
}
const sectionMap = new Map();
const cachedResultMap = new Map();
export class ObjectPropertiesSectionsTreeExpandController {
    expandedProperties;
    constructor(treeOutline) {
        this.expandedProperties = new Set();
        treeOutline.addEventListener(UI.TreeOutline.Events.ElementAttached, this.elementAttached, this);
        treeOutline.addEventListener(UI.TreeOutline.Events.ElementExpanded, this.elementExpanded, this);
        treeOutline.addEventListener(UI.TreeOutline.Events.ElementCollapsed, this.elementCollapsed, this);
    }
    watchSection(id, section) {
        sectionMap.set(section, id);
        if (this.expandedProperties.has(id)) {
            section.expand();
        }
    }
    stopWatchSectionsWithId(id) {
        for (const property of this.expandedProperties) {
            if (property.startsWith(id + ':')) {
                this.expandedProperties.delete(property);
            }
        }
    }
    elementAttached(event) {
        const element = event.data;
        if (element.isExpandable() && this.expandedProperties.has(this.propertyPath(element))) {
            element.expand();
        }
    }
    elementExpanded(event) {
        const element = event.data;
        this.expandedProperties.add(this.propertyPath(element));
    }
    elementCollapsed(event) {
        const element = event.data;
        this.expandedProperties.delete(this.propertyPath(element));
    }
    propertyPath(treeElement) {
        const cachedPropertyPath = cachedResultMap.get(treeElement);
        if (cachedPropertyPath) {
            return cachedPropertyPath;
        }
        let current = treeElement;
        let sectionRoot = current;
        if (!treeElement.treeOutline) {
            throw new Error('No tree outline available');
        }
        const rootElement = treeElement.treeOutline.rootElement();
        let result;
        while (current !== rootElement) {
            let currentName = '';
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (current.property) {
                // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                currentName = current.property.name;
            }
            else {
                currentName = typeof current.title === 'string' ? current.title : current.title.textContent || '';
            }
            result = currentName + (result ? '.' + result : '');
            sectionRoot = current;
            if (current.parent) {
                current = current.parent;
            }
        }
        const treeOutlineId = sectionMap.get(sectionRoot);
        result = treeOutlineId + (result ? ':' + result : '');
        cachedResultMap.set(treeElement, result);
        return result;
    }
}
let rendererInstance;
export class Renderer {
    static instance(opts = { forceNew: false }) {
        const { forceNew } = opts;
        if (!rendererInstance || forceNew) {
            rendererInstance = new Renderer();
        }
        return rendererInstance;
    }
    async render(object, options) {
        if (!(object instanceof SDK.RemoteObject.RemoteObject)) {
            throw new Error('Can\'t render ' + object);
        }
        options = options || { title: undefined, editable: undefined };
        const title = options.title;
        const section = new ObjectPropertiesSection(object, title);
        if (!title) {
            section.titleLessMode();
        }
        section.editable = Boolean(options.editable);
        return { node: section.element, tree: section };
    }
}
export class ObjectPropertyValue {
    element;
    constructor(element) {
        this.element = element;
    }
    appendApplicableItems(_event, _contextMenu, _object) {
    }
}
export class ExpandableTextPropertyValue extends ObjectPropertyValue {
    text;
    maxLength;
    expandElement;
    maxDisplayableTextLength;
    expandElementText;
    copyButtonText;
    constructor(element, text, maxLength) {
        // abbreviated text and expandable text controls are added as children to element
        super(element);
        const container = element.createChild('span');
        this.text = text;
        this.maxLength = maxLength;
        container.textContent = text.slice(0, maxLength);
        UI.Tooltip.Tooltip.install(container, `${text.slice(0, maxLength)}…`);
        this.expandElement = container.createChild('span');
        this.maxDisplayableTextLength = 10000000;
        const byteCount = Platform.StringUtilities.countWtf8Bytes(text);
        const totalBytesText = Platform.NumberUtilities.bytesToString(byteCount);
        if (this.text.length < this.maxDisplayableTextLength) {
            this.expandElementText = i18nString(UIStrings.showMoreS, { PH1: totalBytesText });
            this.expandElement.setAttribute('data-text', this.expandElementText);
            this.expandElement.classList.add('expandable-inline-button');
            this.expandElement.addEventListener('click', this.expandText.bind(this));
            this.expandElement.addEventListener('keydown', (event) => {
                const keyboardEvent = event;
                if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                    this.expandText();
                }
            });
            UI.ARIAUtils.markAsButton(this.expandElement);
        }
        else {
            this.expandElement.setAttribute('data-text', i18nString(UIStrings.longTextWasTruncatedS, { PH1: totalBytesText }));
            this.expandElement.classList.add('undisplayable-text');
        }
        this.copyButtonText = i18nString(UIStrings.copy);
        const copyButton = container.createChild('span', 'expandable-inline-button');
        copyButton.setAttribute('data-text', this.copyButtonText);
        copyButton.addEventListener('click', this.copyText.bind(this));
        copyButton.addEventListener('keydown', (event) => {
            const keyboardEvent = event;
            if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                this.copyText();
            }
        });
        UI.ARIAUtils.markAsButton(copyButton);
    }
    appendApplicableItems(_event, contextMenu, _object) {
        if (this.text.length < this.maxDisplayableTextLength && this.expandElement) {
            contextMenu.clipboardSection().appendItem(this.expandElementText || '', this.expandText.bind(this));
        }
        contextMenu.clipboardSection().appendItem(this.copyButtonText, this.copyText.bind(this));
    }
    expandText() {
        if (!this.expandElement) {
            return;
        }
        if (this.expandElement.parentElement) {
            this.expandElement.parentElement.insertBefore(document.createTextNode(this.text.slice(this.maxLength)), this.expandElement);
        }
        this.expandElement.remove();
        this.expandElement = null;
    }
    copyText() {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(this.text);
    }
}
//# sourceMappingURL=ObjectPropertiesSection.js.map