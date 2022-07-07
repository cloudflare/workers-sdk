// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';
import { Events as ProfileHeaderEvents } from './ProfileHeader.js';
const UIStrings = {
    /**
    *@description Text to save something
    */
    save: 'Save',
    /**
    *@description Text to save something (with ellipsis)
    */
    saveWithEllipsis: 'Save…',
    /**
    *@description A context menu item in the Profiles Panel of a profiler tool
    */
    load: 'Load…',
    /**
    *@description Text to delete something
    */
    delete: 'Delete',
};
const str_ = i18n.i18n.registerUIStrings('panels/profiler/ProfileSidebarTreeElement.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let sharedFileSelectorElement = null;
function getSharedFileSelectorElement() {
    return sharedFileSelectorElement;
}
export function setSharedFileSelectorElement(element) {
    sharedFileSelectorElement = element;
}
export class ProfileSidebarTreeElement extends UI.TreeOutline.TreeElement {
    iconElement;
    titlesElement;
    titleContainer;
    titleElement;
    subtitleElement;
    className;
    small;
    dataDisplayDelegate;
    profile;
    saveLinkElement;
    editing;
    constructor(dataDisplayDelegate, profile, className) {
        super('', false);
        this.iconElement = document.createElement('div');
        this.iconElement.classList.add('icon');
        this.titlesElement = document.createElement('div');
        this.titlesElement.classList.add('titles');
        this.titlesElement.classList.add('no-subtitle');
        this.titleContainer = this.titlesElement.createChild('span', 'title-container');
        this.titleElement = this.titleContainer.createChild('span', 'title');
        this.subtitleElement = this.titlesElement.createChild('span', 'subtitle');
        this.titleElement.textContent = profile.title;
        this.className = className;
        this.small = false;
        this.dataDisplayDelegate = dataDisplayDelegate;
        this.profile = profile;
        profile.addEventListener(ProfileHeaderEvents.UpdateStatus, this.updateStatus, this);
        if (profile.canSaveToFile()) {
            this.createSaveLink();
        }
        else {
            profile.addEventListener(ProfileHeaderEvents.ProfileReceived, this.onProfileReceived, this);
        }
    }
    createSaveLink() {
        this.saveLinkElement = this.titleContainer.createChild('span', 'save-link');
        this.saveLinkElement.textContent = i18nString(UIStrings.save);
        this.saveLinkElement.addEventListener('click', this.saveProfile.bind(this), false);
    }
    onProfileReceived() {
        this.createSaveLink();
    }
    updateStatus(event) {
        const statusUpdate = event.data;
        if (statusUpdate.subtitle !== null) {
            this.subtitleElement.textContent = statusUpdate.subtitle || '';
            this.titlesElement.classList.toggle('no-subtitle', !statusUpdate.subtitle);
        }
        if (typeof statusUpdate.wait === 'boolean' && this.listItemElement) {
            this.iconElement.classList.toggle('spinner', statusUpdate.wait);
            this.listItemElement.classList.toggle('wait', statusUpdate.wait);
        }
    }
    ondblclick(event) {
        if (!this.editing) {
            this.startEditing(event.target);
        }
        return false;
    }
    startEditing(eventTarget) {
        const container = eventTarget.enclosingNodeOrSelfWithClass('title');
        if (!container) {
            return;
        }
        const config = new UI.InplaceEditor.Config(this.editingCommitted.bind(this), this.editingCancelled.bind(this));
        this.editing = UI.InplaceEditor.InplaceEditor.startEditing(container, config);
    }
    editingCommitted(container, newTitle) {
        delete this.editing;
        this.profile.setTitle(newTitle);
    }
    editingCancelled() {
        delete this.editing;
    }
    dispose() {
        this.profile.removeEventListener(ProfileHeaderEvents.UpdateStatus, this.updateStatus, this);
        this.profile.removeEventListener(ProfileHeaderEvents.ProfileReceived, this.onProfileReceived, this);
    }
    onselect() {
        this.dataDisplayDelegate.showProfile(this.profile);
        return true;
    }
    ondelete() {
        this.profile.profileType().removeProfile(this.profile);
        return true;
    }
    onattach() {
        if (this.className) {
            this.listItemElement.classList.add(this.className);
        }
        if (this.small) {
            this.listItemElement.classList.add('small');
        }
        this.listItemElement.append(this.iconElement, this.titlesElement);
        this.listItemElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), true);
        UI.ARIAUtils.setDescription(this.listItemElement, this.profile.profileType().name);
    }
    handleContextMenuEvent(event) {
        const profile = this.profile;
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        // FIXME: use context menu provider
        const sharedFileSelectorElement = getSharedFileSelectorElement();
        if (!sharedFileSelectorElement) {
            throw new Error('File selector element shared by ProfilePanel instances is missing');
        }
        contextMenu.headerSection().appendItem(i18nString(UIStrings.load), sharedFileSelectorElement.click.bind(sharedFileSelectorElement));
        if (profile.canSaveToFile()) {
            contextMenu.saveSection().appendItem(i18nString(UIStrings.saveWithEllipsis), profile.saveToFile.bind(profile));
        }
        contextMenu.footerSection().appendItem(i18nString(UIStrings.delete), this.ondelete.bind(this));
        void contextMenu.show();
    }
    saveProfile(_event) {
        this.profile.saveToFile();
    }
    setSmall(small) {
        this.small = small;
        if (this.listItemElement) {
            this.listItemElement.classList.toggle('small', this.small);
        }
    }
    setMainTitle(title) {
        this.titleElement.textContent = title;
    }
}
//# sourceMappingURL=ProfileSidebarTreeElement.js.map