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
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import * as Utils from './utils/utils.js';
import { ActionRegistry } from './ActionRegistry.js';
import * as ARIAUtils from './ARIAUtils.js';
import { ContextMenu } from './ContextMenu.js';
import { GlassPane } from './GlassPane.js';
import { Icon } from './Icon.js';
import { bindCheckbox } from './SettingsUI.js';
import { Events as TextPromptEvents, TextPrompt } from './TextPrompt.js';
import { Tooltip } from './Tooltip.js';
import { CheckboxLabel, LongClickController } from './UIUtils.js';
import toolbarStyles from './toolbar.css.legacy.js';
const UIStrings = {
    /**
    *@description Announced screen reader message for ToolbarSettingToggle when the setting is toggled on.
    */
    pressed: 'pressed',
    /**
    *@description Announced screen reader message for ToolbarSettingToggle when the setting is toggled off.
    */
    notPressed: 'not pressed',
    /**
    *@description Tooltip shown when the user hovers over the clear icon to empty the text input.
    */
    clearInput: 'Clear input',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/Toolbar.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class Toolbar {
    items;
    element;
    enabled;
    shadowRoot;
    contentElement;
    insertionPoint;
    compactLayout = false;
    constructor(className, parentElement) {
        this.items = [];
        this.element = (parentElement ? parentElement.createChild('div') : document.createElement('div'));
        this.element.className = className;
        this.element.classList.add('toolbar');
        this.enabled = true;
        this.shadowRoot =
            Utils.createShadowRootWithCoreStyles(this.element, { cssFile: toolbarStyles, delegatesFocus: undefined });
        this.contentElement = this.shadowRoot.createChild('div', 'toolbar-shadow');
        this.insertionPoint = this.contentElement.createChild('slot');
    }
    hasCompactLayout() {
        return this.compactLayout;
    }
    registerCSSFiles(cssFiles) {
        this.shadowRoot.adoptedStyleSheets = this.shadowRoot.adoptedStyleSheets.concat(cssFiles);
    }
    setCompactLayout(enable) {
        if (this.compactLayout === enable) {
            return;
        }
        this.compactLayout = enable;
        for (const item of this.items) {
            item.setCompactLayout(enable);
        }
    }
    static createLongPressActionButton(action, toggledOptions, untoggledOptions) {
        const button = Toolbar.createActionButton(action);
        const mainButtonClone = Toolbar.createActionButton(action);
        let longClickController = null;
        let longClickButtons = null;
        let longClickGlyph = null;
        action.addEventListener("Toggled" /* Toggled */, updateOptions);
        updateOptions();
        return button;
        function updateOptions() {
            const buttons = action.toggled() ? (toggledOptions || null) : (untoggledOptions || null);
            if (buttons && buttons.length) {
                if (!longClickController) {
                    longClickController = new LongClickController(button.element, showOptions);
                    longClickGlyph = Icon.create('largeicon-longclick-triangle', 'long-click-glyph');
                    button.element.appendChild(longClickGlyph);
                    longClickButtons = buttons;
                }
            }
            else {
                if (longClickController) {
                    longClickController.dispose();
                    longClickController = null;
                    if (longClickGlyph) {
                        longClickGlyph.remove();
                    }
                    longClickGlyph = null;
                    longClickButtons = null;
                }
            }
        }
        function showOptions() {
            let buttons = longClickButtons ? longClickButtons.slice() : [];
            buttons.push(mainButtonClone);
            const document = button.element.ownerDocument;
            document.documentElement.addEventListener('mouseup', mouseUp, false);
            const optionsGlassPane = new GlassPane();
            optionsGlassPane.setPointerEventsBehavior("BlockedByGlassPane" /* BlockedByGlassPane */);
            optionsGlassPane.show(document);
            const optionsBar = new Toolbar('fill', optionsGlassPane.contentElement);
            optionsBar.contentElement.classList.add('floating');
            const buttonHeight = 26;
            const hostButtonPosition = button.element.boxInWindow().relativeToElement(GlassPane.container(document));
            const topNotBottom = hostButtonPosition.y + buttonHeight * buttons.length < document.documentElement.offsetHeight;
            if (topNotBottom) {
                buttons = buttons.reverse();
            }
            optionsBar.element.style.height = (buttonHeight * buttons.length) + 'px';
            if (topNotBottom) {
                optionsBar.element.style.top = (hostButtonPosition.y - 5) + 'px';
            }
            else {
                optionsBar.element.style.top = (hostButtonPosition.y - (buttonHeight * (buttons.length - 1)) - 6) + 'px';
            }
            optionsBar.element.style.left = (hostButtonPosition.x - 5) + 'px';
            for (let i = 0; i < buttons.length; ++i) {
                buttons[i].element.addEventListener('mousemove', mouseOver, false);
                buttons[i].element.addEventListener('mouseout', mouseOut, false);
                optionsBar.appendToolbarItem(buttons[i]);
            }
            const hostButtonIndex = topNotBottom ? 0 : buttons.length - 1;
            buttons[hostButtonIndex].element.classList.add('emulate-active');
            function mouseOver(e) {
                if (e.which !== 1) {
                    return;
                }
                if (e.target instanceof HTMLElement) {
                    const buttonElement = e.target.enclosingNodeOrSelfWithClass('toolbar-item');
                    buttonElement.classList.add('emulate-active');
                }
            }
            function mouseOut(e) {
                if (e.which !== 1) {
                    return;
                }
                if (e.target instanceof HTMLElement) {
                    const buttonElement = e.target.enclosingNodeOrSelfWithClass('toolbar-item');
                    buttonElement.classList.remove('emulate-active');
                }
            }
            function mouseUp(e) {
                if (e.which !== 1) {
                    return;
                }
                optionsGlassPane.hide();
                document.documentElement.removeEventListener('mouseup', mouseUp, false);
                for (let i = 0; i < buttons.length; ++i) {
                    if (buttons[i].element.classList.contains('emulate-active')) {
                        buttons[i].element.classList.remove('emulate-active');
                        buttons[i].clicked(e);
                        break;
                    }
                }
            }
        }
    }
    static createActionButton(action, options = TOOLBAR_BUTTON_DEFAULT_OPTIONS) {
        const button = action.toggleable() ? makeToggle() : makeButton();
        if (options.showLabel) {
            button.setText(action.title());
        }
        let handler = (_event) => {
            void action.execute();
        };
        if (options.userActionCode) {
            const actionCode = options.userActionCode;
            handler = () => {
                Host.userMetrics.actionTaken(actionCode);
                void action.execute();
            };
        }
        button.addEventListener(ToolbarButton.Events.Click, handler, action);
        action.addEventListener("Enabled" /* Enabled */, enabledChanged);
        button.setEnabled(action.enabled());
        return button;
        function makeButton() {
            const button = new ToolbarButton(action.title(), action.icon());
            if (action.title()) {
                Tooltip.installWithActionBinding(button.element, action.title(), action.id());
            }
            return button;
        }
        function makeToggle() {
            const toggleButton = new ToolbarToggle(action.title(), action.icon(), action.toggledIcon());
            toggleButton.setToggleWithRedColor(action.toggleWithRedColor());
            action.addEventListener("Toggled" /* Toggled */, toggled);
            toggled();
            return toggleButton;
            function toggled() {
                toggleButton.setToggled(action.toggled());
                if (action.title()) {
                    toggleButton.setTitle(action.title());
                    Tooltip.installWithActionBinding(toggleButton.element, action.title(), action.id());
                }
            }
        }
        function enabledChanged(event) {
            button.setEnabled(event.data);
        }
    }
    static createActionButtonForId(actionId, options = TOOLBAR_BUTTON_DEFAULT_OPTIONS) {
        const action = ActionRegistry.instance().action(actionId);
        return Toolbar.createActionButton(action, options);
    }
    gripElementForResize() {
        return this.contentElement;
    }
    makeWrappable(growVertically) {
        this.contentElement.classList.add('wrappable');
        if (growVertically) {
            this.contentElement.classList.add('toolbar-grow-vertical');
        }
    }
    makeVertical() {
        this.contentElement.classList.add('vertical');
    }
    makeBlueOnHover() {
        this.contentElement.classList.add('toolbar-blue-on-hover');
    }
    makeToggledGray() {
        this.contentElement.classList.add('toolbar-toggled-gray');
    }
    renderAsLinks() {
        this.contentElement.classList.add('toolbar-render-as-links');
    }
    empty() {
        return !this.items.length;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        for (const item of this.items) {
            item.applyEnabledState(this.enabled && item.enabled);
        }
    }
    appendToolbarItem(item) {
        this.items.push(item);
        item.toolbar = this;
        item.setCompactLayout(this.hasCompactLayout());
        if (!this.enabled) {
            item.applyEnabledState(false);
        }
        this.contentElement.insertBefore(item.element, this.insertionPoint);
        this.hideSeparatorDupes();
    }
    appendSeparator() {
        this.appendToolbarItem(new ToolbarSeparator());
    }
    appendSpacer() {
        this.appendToolbarItem(new ToolbarSeparator(true));
    }
    appendText(text) {
        this.appendToolbarItem(new ToolbarText(text));
    }
    removeToolbarItem(itemToRemove) {
        const updatedItems = [];
        for (const item of this.items) {
            if (item === itemToRemove) {
                item.element.remove();
            }
            else {
                updatedItems.push(item);
            }
        }
        this.items = updatedItems;
    }
    removeToolbarItems() {
        for (const item of this.items) {
            item.toolbar = null;
        }
        this.items = [];
        this.contentElement.removeChildren();
        this.insertionPoint = this.contentElement.createChild('slot');
    }
    setColor(color) {
        const style = document.createElement('style');
        style.textContent = '.toolbar-glyph { background-color: ' + color + ' !important }';
        this.shadowRoot.appendChild(style);
    }
    setToggledColor(color) {
        const style = document.createElement('style');
        style.textContent =
            '.toolbar-button.toolbar-state-on .toolbar-glyph { background-color: ' + color + ' !important }';
        this.shadowRoot.appendChild(style);
    }
    hideSeparatorDupes() {
        if (!this.items.length) {
            return;
        }
        // Don't hide first and last separators if they were added explicitly.
        let previousIsSeparator = false;
        let lastSeparator;
        let nonSeparatorVisible = false;
        for (let i = 0; i < this.items.length; ++i) {
            if (this.items[i] instanceof ToolbarSeparator) {
                this.items[i].setVisible(!previousIsSeparator);
                previousIsSeparator = true;
                lastSeparator = this.items[i];
                continue;
            }
            if (this.items[i].visible()) {
                previousIsSeparator = false;
                lastSeparator = null;
                nonSeparatorVisible = true;
            }
        }
        if (lastSeparator && lastSeparator !== this.items[this.items.length - 1]) {
            lastSeparator.setVisible(false);
        }
        this.element.classList.toggle('hidden', lastSeparator !== null && lastSeparator !== undefined && lastSeparator.visible() && !nonSeparatorVisible);
    }
    async appendItemsAtLocation(location) {
        const extensions = getRegisteredToolbarItems();
        extensions.sort((extension1, extension2) => {
            const order1 = extension1.order || 0;
            const order2 = extension2.order || 0;
            return order1 - order2;
        });
        const filtered = extensions.filter(e => e.location === location);
        const items = await Promise.all(filtered.map(extension => {
            const { separator, actionId, showLabel, loadItem } = extension;
            if (separator) {
                return new ToolbarSeparator();
            }
            if (actionId) {
                return Toolbar.createActionButtonForId(actionId, { showLabel: Boolean(showLabel), userActionCode: undefined });
            }
            // TODO(crbug.com/1134103) constratint the case checked with this if using TS type definitions once UI is TS-authored.
            if (!loadItem) {
                throw new Error('Could not load a toolbar item registration with no loadItem function');
            }
            return loadItem().then(p => p.item());
        }));
        for (const item of items) {
            if (item) {
                this.appendToolbarItem(item);
            }
        }
    }
}
const TOOLBAR_BUTTON_DEFAULT_OPTIONS = {
    showLabel: false,
    userActionCode: undefined,
};
// We need any here because Common.ObjectWrapper.ObjectWrapper is invariant in T.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ToolbarItem extends Common.ObjectWrapper.ObjectWrapper {
    element;
    visibleInternal;
    enabled;
    toolbar;
    title;
    constructor(element) {
        super();
        this.element = element;
        this.element.classList.add('toolbar-item');
        this.visibleInternal = true;
        this.enabled = true;
        /**
         * Set by the parent toolbar during appending.
         */
        this.toolbar = null;
    }
    setTitle(title, actionId = undefined) {
        if (this.title === title) {
            return;
        }
        this.title = title;
        ARIAUtils.setAccessibleName(this.element, title);
        if (actionId === undefined) {
            Tooltip.install(this.element, title);
        }
        else {
            Tooltip.installWithActionBinding(this.element, title, actionId);
        }
    }
    setEnabled(value) {
        if (this.enabled === value) {
            return;
        }
        this.enabled = value;
        this.applyEnabledState(this.enabled && (!this.toolbar || this.toolbar.enabled));
    }
    applyEnabledState(enabled) {
        // @ts-ignore: Ignoring in favor of an `instanceof` check for all the different
        //             kind of HTMLElement classes that have a disabled attribute.
        this.element.disabled = !enabled;
    }
    visible() {
        return this.visibleInternal;
    }
    setVisible(x) {
        if (this.visibleInternal === x) {
            return;
        }
        this.element.classList.toggle('hidden', !x);
        this.visibleInternal = x;
        if (this.toolbar && !(this instanceof ToolbarSeparator)) {
            this.toolbar.hideSeparatorDupes();
        }
    }
    setRightAligned(alignRight) {
        this.element.classList.toggle('toolbar-item-right-aligned', alignRight);
    }
    setCompactLayout(_enable) {
    }
}
export class ToolbarItemWithCompactLayout extends ToolbarItem {
    constructor(element) {
        super(element);
    }
    setCompactLayout(enable) {
        this.dispatchEventToListeners("CompactLayoutUpdated" /* CompactLayoutUpdated */, enable);
    }
}
export class ToolbarText extends ToolbarItem {
    constructor(text) {
        const element = document.createElement('div');
        element.classList.add('toolbar-text');
        super(element);
        this.element.classList.add('toolbar-text');
        this.setText(text || '');
    }
    text() {
        return this.element.textContent || '';
    }
    setText(text) {
        this.element.textContent = text;
    }
}
export class ToolbarButton extends ToolbarItem {
    glyphElement;
    textElement;
    text;
    glyph;
    icon;
    /**
     * TODO(crbug.com/1126026): remove glyph parameter in favor of icon.
     */
    constructor(title, glyphOrIcon, text) {
        const element = document.createElement('button');
        element.classList.add('toolbar-button');
        super(element);
        this.element.addEventListener('click', this.clicked.bind(this), false);
        this.element.addEventListener('mousedown', this.mouseDown.bind(this), false);
        this.glyphElement = Icon.create('', 'toolbar-glyph hidden');
        this.element.appendChild(this.glyphElement);
        this.textElement = this.element.createChild('div', 'toolbar-text hidden');
        this.setTitle(title);
        if (glyphOrIcon) {
            this.setGlyphOrIcon(glyphOrIcon);
        }
        this.setText(text || '');
        this.title = '';
    }
    focus() {
        this.element.focus();
    }
    setText(text) {
        if (this.text === text) {
            return;
        }
        this.textElement.textContent = text;
        this.textElement.classList.toggle('hidden', !text);
        this.text = text;
    }
    setGlyphOrIcon(glyphOrIcon) {
        if (glyphOrIcon instanceof HTMLElement) {
            glyphOrIcon.classList.add('toolbar-icon');
            if (this.icon) {
                this.icon.replaceWith(glyphOrIcon);
            }
            else {
                this.element.appendChild(glyphOrIcon);
            }
            this.icon = glyphOrIcon;
        }
        else if (glyphOrIcon) {
            this.setGlyph(glyphOrIcon);
        }
    }
    setGlyph(glyph) {
        if (this.glyph === glyph) {
            return;
        }
        this.glyphElement.setIconType(glyph);
        this.glyphElement.classList.toggle('hidden', !glyph);
        this.element.classList.toggle('toolbar-has-glyph', Boolean(glyph));
        this.glyph = glyph;
    }
    setBackgroundImage(iconURL) {
        this.element.style.backgroundImage = 'url(' + iconURL + ')';
    }
    setSecondary() {
        this.element.classList.add('toolbar-button-secondary');
    }
    setDarkText() {
        this.element.classList.add('dark-text');
    }
    turnIntoSelect(shrinkable = false) {
        this.element.classList.add('toolbar-has-dropdown');
        if (shrinkable) {
            this.element.classList.add('toolbar-has-dropdown-shrinkable');
        }
        const dropdownArrowIcon = Icon.create('smallicon-triangle-down', 'toolbar-dropdown-arrow');
        this.element.appendChild(dropdownArrowIcon);
    }
    clicked(event) {
        if (!this.enabled) {
            return;
        }
        this.dispatchEventToListeners(ToolbarButton.Events.Click, event);
        event.consume();
    }
    mouseDown(event) {
        if (!this.enabled) {
            return;
        }
        this.dispatchEventToListeners(ToolbarButton.Events.MouseDown, event);
    }
}
(function (ToolbarButton) {
    // TODO(crbug.com/1167717): Make this a const enum again
    // eslint-disable-next-line rulesdir/const_enum
    let Events;
    (function (Events) {
        Events["Click"] = "Click";
        Events["MouseDown"] = "MouseDown";
    })(Events = ToolbarButton.Events || (ToolbarButton.Events = {}));
})(ToolbarButton || (ToolbarButton = {}));
export class ToolbarInput extends ToolbarItem {
    prompt;
    proxyElement;
    constructor(placeholder, accessiblePlaceholder, growFactor, shrinkFactor, tooltip, completions, dynamicCompletions) {
        const element = document.createElement('div');
        element.classList.add('toolbar-input');
        super(element);
        const internalPromptElement = this.element.createChild('div', 'toolbar-input-prompt');
        ARIAUtils.setAccessibleName(internalPromptElement, placeholder);
        internalPromptElement.addEventListener('focus', () => this.element.classList.add('focused'));
        internalPromptElement.addEventListener('blur', () => this.element.classList.remove('focused'));
        this.prompt = new TextPrompt();
        this.proxyElement = this.prompt.attach(internalPromptElement);
        this.proxyElement.classList.add('toolbar-prompt-proxy');
        this.proxyElement.addEventListener('keydown', (event) => this.onKeydownCallback(event));
        this.prompt.initialize(completions || (() => Promise.resolve([])), ' ', dynamicCompletions);
        if (tooltip) {
            this.prompt.setTitle(tooltip);
        }
        this.prompt.setPlaceholder(placeholder, accessiblePlaceholder);
        this.prompt.addEventListener(TextPromptEvents.TextChanged, this.onChangeCallback.bind(this));
        if (growFactor) {
            this.element.style.flexGrow = String(growFactor);
        }
        if (shrinkFactor) {
            this.element.style.flexShrink = String(shrinkFactor);
        }
        const clearButton = this.element.createChild('div', 'toolbar-input-clear-button');
        clearButton.title = UIStrings.clearInput;
        clearButton.appendChild(Icon.create('mediumicon-gray-cross-active', 'search-cancel-button'));
        clearButton.addEventListener('click', () => {
            this.setValue('', true);
            this.prompt.focus();
        });
        this.updateEmptyStyles();
    }
    applyEnabledState(enabled) {
        this.prompt.setEnabled(enabled);
    }
    setValue(value, notify) {
        this.prompt.setText(value);
        if (notify) {
            this.onChangeCallback();
        }
        this.updateEmptyStyles();
    }
    value() {
        return this.prompt.textWithCurrentSuggestion();
    }
    onKeydownCallback(event) {
        if (event.key === 'Enter' && this.prompt.text()) {
            this.dispatchEventToListeners(ToolbarInput.Event.EnterPressed, this.prompt.text());
        }
        if (!isEscKey(event) || !this.prompt.text()) {
            return;
        }
        this.setValue('', true);
        event.consume(true);
    }
    onChangeCallback() {
        this.updateEmptyStyles();
        this.dispatchEventToListeners(ToolbarInput.Event.TextChanged, this.prompt.text());
    }
    updateEmptyStyles() {
        this.element.classList.toggle('toolbar-input-empty', !this.prompt.text());
    }
}
(function (ToolbarInput) {
    // TODO(crbug.com/1167717): Make this a const enum again
    // eslint-disable-next-line rulesdir/const_enum
    let Event;
    (function (Event) {
        Event["TextChanged"] = "TextChanged";
        Event["EnterPressed"] = "EnterPressed";
    })(Event = ToolbarInput.Event || (ToolbarInput.Event = {}));
})(ToolbarInput || (ToolbarInput = {}));
export class ToolbarToggle extends ToolbarButton {
    toggledInternal;
    untoggledGlyphOrIcon;
    toggledGlyphOrIcon;
    constructor(title, glyphOrIcon, toggledGlyphOrIcon) {
        super(title, glyphOrIcon, '');
        this.toggledInternal = false;
        this.untoggledGlyphOrIcon = glyphOrIcon;
        this.toggledGlyphOrIcon = toggledGlyphOrIcon;
        this.element.classList.add('toolbar-state-off');
        ARIAUtils.setPressed(this.element, false);
    }
    toggled() {
        return this.toggledInternal;
    }
    setToggled(toggled) {
        if (this.toggledInternal === toggled) {
            return;
        }
        this.toggledInternal = toggled;
        this.element.classList.toggle('toolbar-state-on', toggled);
        this.element.classList.toggle('toolbar-state-off', !toggled);
        ARIAUtils.setPressed(this.element, toggled);
        if (this.toggledGlyphOrIcon && this.untoggledGlyphOrIcon) {
            this.setGlyphOrIcon(toggled ? this.toggledGlyphOrIcon : this.untoggledGlyphOrIcon);
        }
    }
    setDefaultWithRedColor(withRedColor) {
        this.element.classList.toggle('toolbar-default-with-red-color', withRedColor);
    }
    setToggleWithRedColor(toggleWithRedColor) {
        this.element.classList.toggle('toolbar-toggle-with-red-color', toggleWithRedColor);
    }
    setToggleWithDot(toggleWithDot) {
        this.element.classList.toggle('toolbar-toggle-with-dot', toggleWithDot);
    }
}
export class ToolbarMenuButton extends ToolbarButton {
    contextMenuHandler;
    useSoftMenu;
    triggerTimeout;
    lastTriggerTime;
    constructor(contextMenuHandler, useSoftMenu) {
        super('', 'largeicon-menu');
        this.contextMenuHandler = contextMenuHandler;
        this.useSoftMenu = Boolean(useSoftMenu);
        ARIAUtils.markAsMenuButton(this.element);
    }
    mouseDown(event) {
        if (event.buttons !== 1) {
            super.mouseDown(event);
            return;
        }
        if (!this.triggerTimeout) {
            this.triggerTimeout = window.setTimeout(this.trigger.bind(this, event), 200);
        }
    }
    trigger(event) {
        delete this.triggerTimeout;
        // Throttling avoids entering a bad state on Macs when rapidly triggering context menus just
        // after the window gains focus. See crbug.com/655556
        if (this.lastTriggerTime && Date.now() - this.lastTriggerTime < 300) {
            return;
        }
        const contextMenu = new ContextMenu(event, {
            useSoftMenu: this.useSoftMenu,
            x: this.element.totalOffsetLeft(),
            y: this.element.totalOffsetTop() + this.element.offsetHeight,
        });
        this.contextMenuHandler(contextMenu);
        void contextMenu.show();
        this.lastTriggerTime = Date.now();
    }
    clicked(event) {
        if (this.triggerTimeout) {
            clearTimeout(this.triggerTimeout);
        }
        this.trigger(event);
    }
}
export class ToolbarSettingToggle extends ToolbarToggle {
    defaultTitle;
    setting;
    willAnnounceState;
    constructor(setting, glyph, title) {
        super(title, glyph);
        this.defaultTitle = title;
        this.setting = setting;
        this.settingChanged();
        this.setting.addChangeListener(this.settingChanged, this);
        // Determines whether the toggle state will be announced to a screen reader
        this.willAnnounceState = false;
    }
    settingChanged() {
        const toggled = this.setting.get();
        this.setToggled(toggled);
        const toggleAnnouncement = toggled ? i18nString(UIStrings.pressed) : i18nString(UIStrings.notPressed);
        if (this.willAnnounceState) {
            ARIAUtils.alert(toggleAnnouncement);
        }
        this.willAnnounceState = false;
        this.setTitle(this.defaultTitle);
    }
    clicked(event) {
        this.willAnnounceState = true;
        this.setting.set(!this.toggled());
        super.clicked(event);
    }
}
export class ToolbarSeparator extends ToolbarItem {
    constructor(spacer) {
        const element = document.createElement('div');
        element.classList.add(spacer ? 'toolbar-spacer' : 'toolbar-divider');
        super(element);
    }
}
export class ToolbarComboBox extends ToolbarItem {
    selectElementInternal;
    constructor(changeHandler, title, className) {
        const element = document.createElement('span');
        element.classList.add('toolbar-select-container');
        super(element);
        this.selectElementInternal = this.element.createChild('select', 'toolbar-item');
        const dropdownArrowIcon = Icon.create('smallicon-triangle-down', 'toolbar-dropdown-arrow');
        this.element.appendChild(dropdownArrowIcon);
        if (changeHandler) {
            this.selectElementInternal.addEventListener('change', changeHandler, false);
        }
        ARIAUtils.setAccessibleName(this.selectElementInternal, title);
        super.setTitle(title);
        if (className) {
            this.selectElementInternal.classList.add(className);
        }
    }
    selectElement() {
        return this.selectElementInternal;
    }
    size() {
        return this.selectElementInternal.childElementCount;
    }
    options() {
        return Array.prototype.slice.call(this.selectElementInternal.children, 0);
    }
    addOption(option) {
        this.selectElementInternal.appendChild(option);
    }
    createOption(label, value) {
        const option = this.selectElementInternal.createChild('option');
        option.text = label;
        if (typeof value !== 'undefined') {
            option.value = value;
        }
        return option;
    }
    applyEnabledState(enabled) {
        super.applyEnabledState(enabled);
        this.selectElementInternal.disabled = !enabled;
    }
    removeOption(option) {
        this.selectElementInternal.removeChild(option);
    }
    removeOptions() {
        this.selectElementInternal.removeChildren();
    }
    selectedOption() {
        if (this.selectElementInternal.selectedIndex >= 0) {
            return this.selectElementInternal[this.selectElementInternal.selectedIndex];
        }
        return null;
    }
    select(option) {
        this.selectElementInternal.selectedIndex =
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Array.prototype.indexOf.call(this.selectElementInternal, option);
    }
    setSelectedIndex(index) {
        this.selectElementInternal.selectedIndex = index;
    }
    selectedIndex() {
        return this.selectElementInternal.selectedIndex;
    }
    setMaxWidth(width) {
        this.selectElementInternal.style.maxWidth = width + 'px';
    }
    setMinWidth(width) {
        this.selectElementInternal.style.minWidth = width + 'px';
    }
}
export class ToolbarSettingComboBox extends ToolbarComboBox {
    optionsInternal;
    setting;
    muteSettingListener;
    constructor(options, setting, accessibleName) {
        super(null, accessibleName);
        this.optionsInternal = options;
        this.setting = setting;
        this.selectElementInternal.addEventListener('change', this.valueChanged.bind(this), false);
        this.setOptions(options);
        setting.addChangeListener(this.settingChanged, this);
    }
    setOptions(options) {
        this.optionsInternal = options;
        this.selectElementInternal.removeChildren();
        for (let i = 0; i < options.length; ++i) {
            const dataOption = options[i];
            const option = this.createOption(dataOption.label, dataOption.value);
            this.selectElementInternal.appendChild(option);
            if (this.setting.get() === dataOption.value) {
                this.setSelectedIndex(i);
            }
        }
    }
    value() {
        return this.optionsInternal[this.selectedIndex()].value;
    }
    settingChanged() {
        if (this.muteSettingListener) {
            return;
        }
        const value = this.setting.get();
        for (let i = 0; i < this.optionsInternal.length; ++i) {
            if (value === this.optionsInternal[i].value) {
                this.setSelectedIndex(i);
                break;
            }
        }
    }
    valueChanged(_event) {
        const option = this.optionsInternal[this.selectedIndex()];
        this.muteSettingListener = true;
        this.setting.set(option.value);
        this.muteSettingListener = false;
    }
}
export class ToolbarCheckbox extends ToolbarItem {
    inputElement;
    constructor(text, tooltip, listener) {
        super(CheckboxLabel.create(text));
        this.element.classList.add('checkbox');
        this.inputElement = this.element.checkboxElement;
        if (tooltip) {
            // install on the checkbox
            Tooltip.install(this.inputElement, tooltip);
            Tooltip.install(this.element.textElement, tooltip);
        }
        if (listener) {
            this.inputElement.addEventListener('click', listener, false);
        }
    }
    checked() {
        return this.inputElement.checked;
    }
    setChecked(value) {
        this.inputElement.checked = value;
    }
    applyEnabledState(enabled) {
        super.applyEnabledState(enabled);
        this.inputElement.disabled = !enabled;
    }
    setIndeterminate(indeterminate) {
        this.inputElement.indeterminate = indeterminate;
    }
}
export class ToolbarSettingCheckbox extends ToolbarCheckbox {
    constructor(setting, tooltip, alternateTitle) {
        super(alternateTitle || setting.title() || '', tooltip);
        bindCheckbox(this.inputElement, setting);
    }
}
const registeredToolbarItems = [];
export function registerToolbarItem(registration) {
    registeredToolbarItems.push(registration);
}
function getRegisteredToolbarItems() {
    return registeredToolbarItems.filter(item => Root.Runtime.Runtime.isDescriptorEnabled({ experiment: undefined, condition: item.condition }));
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var ToolbarItemLocation;
(function (ToolbarItemLocation) {
    ToolbarItemLocation["FILES_NAVIGATION_TOOLBAR"] = "files-navigator-toolbar";
    ToolbarItemLocation["MAIN_TOOLBAR_RIGHT"] = "main-toolbar-right";
    ToolbarItemLocation["MAIN_TOOLBAR_LEFT"] = "main-toolbar-left";
    ToolbarItemLocation["STYLES_SIDEBARPANE_TOOLBAR"] = "styles-sidebarpane-toolbar";
})(ToolbarItemLocation || (ToolbarItemLocation = {}));
//# sourceMappingURL=Toolbar.js.map