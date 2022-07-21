// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
export class ProfileHeader extends Common.ObjectWrapper.ObjectWrapper {
    profileTypeInternal;
    title;
    uid;
    fromFileInternal;
    tempFile;
    constructor(profileType, title) {
        super();
        this.profileTypeInternal = profileType;
        this.title = title;
        this.uid = profileType.incrementProfileUid();
        this.fromFileInternal = false;
        this.tempFile = null;
    }
    setTitle(title) {
        this.title = title;
        this.dispatchEventToListeners(Events.ProfileTitleChanged, this);
    }
    profileType() {
        return this.profileTypeInternal;
    }
    updateStatus(subtitle, wait) {
        this.dispatchEventToListeners(Events.UpdateStatus, new StatusUpdate(subtitle, wait));
    }
    /**
     * Must be implemented by subclasses.
     */
    createSidebarTreeElement(_dataDisplayDelegate) {
        throw new Error('Not implemented.');
    }
    createView(_dataDisplayDelegate) {
        throw new Error('Not implemented.');
    }
    removeTempFile() {
        if (this.tempFile) {
            this.tempFile.remove();
        }
    }
    dispose() {
    }
    canSaveToFile() {
        return false;
    }
    saveToFile() {
        throw new Error('Not implemented.');
    }
    loadFromFile(_file) {
        throw new Error('Not implemented.');
    }
    fromFile() {
        return this.fromFileInternal;
    }
    setFromFile() {
        this.fromFileInternal = true;
    }
    setProfile(_profile) {
    }
}
export class StatusUpdate {
    subtitle;
    wait;
    constructor(subtitle, wait) {
        this.subtitle = subtitle;
        this.wait = wait;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["UpdateStatus"] = "UpdateStatus";
    Events["ProfileReceived"] = "ProfileReceived";
    Events["ProfileTitleChanged"] = "ProfileTitleChanged";
})(Events || (Events = {}));
export class ProfileType extends Common.ObjectWrapper.ObjectWrapper {
    idInternal;
    nameInternal;
    profiles;
    profileBeingRecordedInternal;
    nextProfileUidInternal;
    constructor(id, name) {
        super();
        this.idInternal = id;
        this.nameInternal = name;
        this.profiles = [];
        this.profileBeingRecordedInternal = null;
        this.nextProfileUidInternal = 1;
        if (!window.opener) {
            window.addEventListener('unload', this.clearTempStorage.bind(this), false);
        }
    }
    typeName() {
        return '';
    }
    nextProfileUid() {
        return this.nextProfileUidInternal;
    }
    incrementProfileUid() {
        return this.nextProfileUidInternal++;
    }
    hasTemporaryView() {
        return false;
    }
    fileExtension() {
        return null;
    }
    get buttonTooltip() {
        return '';
    }
    get id() {
        return this.idInternal;
    }
    get treeItemTitle() {
        return this.nameInternal;
    }
    get name() {
        return this.nameInternal;
    }
    buttonClicked() {
        return false;
    }
    get description() {
        return '';
    }
    isInstantProfile() {
        return false;
    }
    isEnabled() {
        return true;
    }
    getProfiles() {
        function isFinished(profile) {
            return this.profileBeingRecordedInternal !== profile;
        }
        return this.profiles.filter(isFinished.bind(this));
    }
    customContent() {
        return null;
    }
    setCustomContentEnabled(_enable) {
    }
    getProfile(uid) {
        for (let i = 0; i < this.profiles.length; ++i) {
            if (this.profiles[i].uid === uid) {
                return this.profiles[i];
            }
        }
        return null;
    }
    loadFromFile(file) {
        let name = file.name;
        const fileExtension = this.fileExtension();
        if (fileExtension && name.endsWith(fileExtension)) {
            name = name.substr(0, name.length - fileExtension.length);
        }
        const profile = this.createProfileLoadedFromFile(name);
        profile.setFromFile();
        this.setProfileBeingRecorded(profile);
        this.addProfile(profile);
        return profile.loadFromFile(file);
    }
    createProfileLoadedFromFile(_title) {
        throw new Error('Not implemented');
    }
    addProfile(profile) {
        this.profiles.push(profile);
        this.dispatchEventToListeners(ProfileEvents.AddProfileHeader, profile);
    }
    removeProfile(profile) {
        const index = this.profiles.indexOf(profile);
        if (index === -1) {
            return;
        }
        this.profiles.splice(index, 1);
        this.disposeProfile(profile);
    }
    clearTempStorage() {
        for (let i = 0; i < this.profiles.length; ++i) {
            this.profiles[i].removeTempFile();
        }
    }
    profileBeingRecorded() {
        return this.profileBeingRecordedInternal;
    }
    setProfileBeingRecorded(profile) {
        this.profileBeingRecordedInternal = profile;
    }
    profileBeingRecordedRemoved() {
    }
    reset() {
        for (const profile of this.profiles.slice()) {
            this.disposeProfile(profile);
        }
        this.profiles = [];
        this.nextProfileUidInternal = 1;
    }
    disposeProfile(profile) {
        this.dispatchEventToListeners(ProfileEvents.RemoveProfileHeader, profile);
        profile.dispose();
        if (this.profileBeingRecordedInternal === profile) {
            this.profileBeingRecordedRemoved();
            this.setProfileBeingRecorded(null);
        }
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var ProfileEvents;
(function (ProfileEvents) {
    ProfileEvents["AddProfileHeader"] = "add-profile-header";
    ProfileEvents["ProfileComplete"] = "profile-complete";
    ProfileEvents["RemoveProfileHeader"] = "remove-profile-header";
    ProfileEvents["ViewUpdated"] = "view-updated";
})(ProfileEvents || (ProfileEvents = {}));
//# sourceMappingURL=ProfileHeader.js.map