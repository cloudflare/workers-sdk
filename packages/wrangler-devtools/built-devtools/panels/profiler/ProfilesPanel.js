// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
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
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
// eslint-disable-next-line rulesdir/es_modules_import
import objectValueStyles from '../../ui/legacy/components/object_ui/objectValue.css.js';
import * as UI from '../../ui/legacy/legacy.js';
import heapProfilerStyles from './heapProfiler.css.js';
import profilesPanelStyles from './profilesPanel.css.js';
import profilesSidebarTreeStyles from './profilesSidebarTree.css.js';
import { ProfileEvents as ProfileTypeEvents } from './ProfileHeader.js';
import { Events as ProfileLauncherEvents, ProfileLauncherView } from './ProfileLauncherView.js';
import { ProfileSidebarTreeElement, setSharedFileSelectorElement } from './ProfileSidebarTreeElement.js';
import { instance } from './ProfileTypeRegistry.js';
const UIStrings = {
    /**
    *@description Tooltip text that appears when hovering over the largeicon clear button in the Profiles Panel of a profiler tool
    */
    clearAllProfiles: 'Clear all profiles',
    /**
    *@description Text in Profiles Panel of a profiler tool
    *@example {'.js', '.json'} PH1
    */
    cantLoadFileSupportedFile: 'Can’t load file. Supported file extensions: \'\'{PH1}\'\'.',
    /**
    *@description Text in Profiles Panel of a profiler tool
    */
    cantLoadProfileWhileAnother: 'Can’t load profile while another profile is being recorded.',
    /**
    *@description Text in Profiles Panel of a profiler tool
    *@example {cannot open file} PH1
    */
    profileLoadingFailedS: 'Profile loading failed: {PH1}.',
    /**
    *@description A context menu item in the Profiles Panel of a profiler tool
    */
    load: 'Load…',
    /**
    *@description Text in Profiles Panel of a profiler tool
    *@example {2} PH1
    */
    runD: 'Run {PH1}',
    /**
    *@description Text in Profiles Panel of a profiler tool
    */
    profiles: 'Profiles',
};
const str_ = i18n.i18n.registerUIStrings('panels/profiler/ProfilesPanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ProfilesPanel extends UI.Panel.PanelWithSidebar {
    profileTypes;
    profilesItemTreeElement;
    sidebarTree;
    profileViews;
    toolbarElement;
    toggleRecordAction;
    toggleRecordButton;
    clearResultsButton;
    profileViewToolbar;
    profileGroups;
    launcherView;
    visibleView;
    profileToView;
    typeIdToSidebarSection;
    fileSelectorElement;
    selectedProfileType;
    constructor(name, profileTypes, recordingActionId) {
        super(name);
        this.profileTypes = profileTypes;
        const mainContainer = new UI.Widget.VBox();
        this.splitWidget().setMainWidget(mainContainer);
        this.profilesItemTreeElement = new ProfilesSidebarTreeElement(this);
        this.sidebarTree = new UI.TreeOutline.TreeOutlineInShadow();
        this.sidebarTree.element.classList.add('profiles-sidebar-tree-box');
        this.panelSidebarElement().appendChild(this.sidebarTree.element);
        this.sidebarTree.appendChild(this.profilesItemTreeElement);
        this.sidebarTree.element.addEventListener('keydown', this.onKeyDown.bind(this), false);
        this.profileViews = document.createElement('div');
        this.profileViews.id = 'profile-views';
        this.profileViews.classList.add('vbox');
        mainContainer.element.appendChild(this.profileViews);
        this.toolbarElement = document.createElement('div');
        this.toolbarElement.classList.add('profiles-toolbar');
        mainContainer.element.insertBefore(this.toolbarElement, mainContainer.element.firstChild);
        this.panelSidebarElement().classList.add('profiles-tree-sidebar');
        const toolbarContainerLeft = document.createElement('div');
        toolbarContainerLeft.classList.add('profiles-toolbar');
        this.panelSidebarElement().insertBefore(toolbarContainerLeft, this.panelSidebarElement().firstChild);
        const toolbar = new UI.Toolbar.Toolbar('', toolbarContainerLeft);
        this.toggleRecordAction =
            UI.ActionRegistry.ActionRegistry.instance().action(recordingActionId);
        this.toggleRecordButton = UI.Toolbar.Toolbar.createActionButton(this.toggleRecordAction);
        toolbar.appendToolbarItem(this.toggleRecordButton);
        this.clearResultsButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.clearAllProfiles), 'largeicon-clear');
        this.clearResultsButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.reset, this);
        toolbar.appendToolbarItem(this.clearResultsButton);
        toolbar.appendSeparator();
        toolbar.appendToolbarItem(UI.Toolbar.Toolbar.createActionButtonForId('components.collect-garbage'));
        this.profileViewToolbar = new UI.Toolbar.Toolbar('', this.toolbarElement);
        this.profileViewToolbar.makeWrappable(true);
        this.profileGroups = {};
        this.launcherView = new ProfileLauncherView(this);
        this.launcherView.addEventListener(ProfileLauncherEvents.ProfileTypeSelected, this.onProfileTypeSelected, this);
        this.profileToView = [];
        this.typeIdToSidebarSection = {};
        const types = this.profileTypes;
        for (let i = 0; i < types.length; i++) {
            this.registerProfileType(types[i]);
        }
        this.launcherView.restoreSelectedProfileType();
        this.profilesItemTreeElement.select();
        this.showLauncherView();
        this.createFileSelectorElement();
        this.element.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), false);
        SDK.TargetManager.TargetManager.instance().addEventListener(SDK.TargetManager.Events.SuspendStateChanged, this.onSuspendStateChanged, this);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.CPUProfilerModel.CPUProfilerModel, this.updateProfileTypeSpecificUI, this);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.HeapProfilerModel.HeapProfilerModel, this.updateProfileTypeSpecificUI, this);
    }
    onKeyDown(ev) {
        const event = ev;
        let handled = false;
        if (event.key === 'ArrowDown' && !event.altKey) {
            handled = this.sidebarTree.selectNext();
        }
        else if (event.key === 'ArrowUp' && !event.altKey) {
            handled = this.sidebarTree.selectPrevious();
        }
        if (handled) {
            event.consume(true);
        }
    }
    searchableView() {
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const visibleView = this.visibleView;
        return visibleView && visibleView.searchableView ? visibleView.searchableView() : null;
    }
    createFileSelectorElement() {
        if (this.fileSelectorElement) {
            this.element.removeChild(this.fileSelectorElement);
        }
        this.fileSelectorElement = UI.UIUtils.createFileSelectorElement(this.loadFromFile.bind(this));
        setSharedFileSelectorElement(this.fileSelectorElement);
        this.element.appendChild(this.fileSelectorElement);
    }
    findProfileTypeByExtension(fileName) {
        return this.profileTypes.find(type => Boolean(type.fileExtension()) && fileName.endsWith(type.fileExtension() || '')) ||
            null;
    }
    async loadFromFile(file) {
        this.createFileSelectorElement();
        const profileType = this.findProfileTypeByExtension(file.name);
        if (!profileType) {
            const extensions = new Set(this.profileTypes.map(type => type.fileExtension()).filter(ext => ext));
            Common.Console.Console.instance().error(i18nString(UIStrings.cantLoadFileSupportedFile, { PH1: Array.from(extensions).join('\', \'') }));
            return;
        }
        if (Boolean(profileType.profileBeingRecorded())) {
            Common.Console.Console.instance().error(i18nString(UIStrings.cantLoadProfileWhileAnother));
            return;
        }
        const error = await profileType.loadFromFile(file);
        if (error && 'message' in error) {
            void UI.UIUtils.MessageDialog.show(i18nString(UIStrings.profileLoadingFailedS, { PH1: error.message }));
        }
    }
    toggleRecord() {
        if (!this.toggleRecordAction.enabled()) {
            return true;
        }
        const toggleButton = Platform.DOMUtilities.deepActiveElement(this.element.ownerDocument);
        const type = this.selectedProfileType;
        if (!type) {
            return true;
        }
        const isProfiling = type.buttonClicked();
        this.updateToggleRecordAction(isProfiling);
        if (isProfiling) {
            this.launcherView.profileStarted();
            if (type.hasTemporaryView()) {
                this.showProfile(type.profileBeingRecorded());
            }
        }
        else {
            this.launcherView.profileFinished();
        }
        if (toggleButton) {
            toggleButton.focus();
        }
        return true;
    }
    onSuspendStateChanged() {
        this.updateToggleRecordAction(this.toggleRecordAction.toggled());
    }
    updateToggleRecordAction(toggled) {
        const hasSelectedTarget = Boolean(UI.Context.Context.instance().flavor(SDK.CPUProfilerModel.CPUProfilerModel) ||
            UI.Context.Context.instance().flavor(SDK.HeapProfilerModel.HeapProfilerModel));
        const enable = toggled || (!SDK.TargetManager.TargetManager.instance().allTargetsSuspended() && hasSelectedTarget);
        this.toggleRecordAction.setEnabled(enable);
        this.toggleRecordAction.setToggled(toggled);
        if (enable) {
            this.toggleRecordButton.setTitle(this.selectedProfileType ? this.selectedProfileType.buttonTooltip : '');
        }
        else {
            this.toggleRecordButton.setTitle(UI.UIUtils.anotherProfilerActiveLabel());
        }
        if (this.selectedProfileType) {
            this.launcherView.updateProfileType(this.selectedProfileType, enable);
        }
    }
    profileBeingRecordedRemoved() {
        this.updateToggleRecordAction(false);
        this.launcherView.profileFinished();
    }
    onProfileTypeSelected(event) {
        this.selectedProfileType = event.data;
        this.updateProfileTypeSpecificUI();
    }
    updateProfileTypeSpecificUI() {
        this.updateToggleRecordAction(this.toggleRecordAction.toggled());
    }
    reset() {
        this.profileTypes.forEach(type => type.reset());
        delete this.visibleView;
        this.profileGroups = {};
        this.updateToggleRecordAction(false);
        this.launcherView.profileFinished();
        this.sidebarTree.element.classList.remove('some-expandable');
        this.launcherView.detach();
        this.profileViews.removeChildren();
        this.profileViewToolbar.removeToolbarItems();
        this.clearResultsButton.element.classList.remove('hidden');
        this.profilesItemTreeElement.select();
        this.showLauncherView();
    }
    showLauncherView() {
        this.closeVisibleView();
        this.profileViewToolbar.removeToolbarItems();
        this.launcherView.show(this.profileViews);
        this.visibleView = this.launcherView;
        this.toolbarElement.classList.add('hidden');
    }
    registerProfileType(profileType) {
        this.launcherView.addProfileType(profileType);
        const profileTypeSection = new ProfileTypeSidebarSection(this, profileType);
        this.typeIdToSidebarSection[profileType.id] = profileTypeSection;
        this.sidebarTree.appendChild(profileTypeSection);
        profileTypeSection.childrenListElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), false);
        function onAddProfileHeader(event) {
            this.addProfileHeader(event.data);
        }
        function onRemoveProfileHeader(event) {
            this.removeProfileHeader(event.data);
        }
        function profileComplete(event) {
            this.showProfile(event.data);
        }
        profileType.addEventListener(ProfileTypeEvents.ViewUpdated, this.updateProfileTypeSpecificUI, this);
        profileType.addEventListener(ProfileTypeEvents.AddProfileHeader, onAddProfileHeader, this);
        profileType.addEventListener(ProfileTypeEvents.RemoveProfileHeader, onRemoveProfileHeader, this);
        profileType.addEventListener(ProfileTypeEvents.ProfileComplete, profileComplete, this);
        const profiles = profileType.getProfiles();
        for (let i = 0; i < profiles.length; i++) {
            this.addProfileHeader(profiles[i]);
        }
    }
    handleContextMenuEvent(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        if (this.panelSidebarElement().isSelfOrAncestor(event.target)) {
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.load), this.fileSelectorElement.click.bind(this.fileSelectorElement));
        }
        void contextMenu.show();
    }
    showLoadFromFileDialog() {
        this.fileSelectorElement.click();
    }
    addProfileHeader(profile) {
        const profileType = profile.profileType();
        const typeId = profileType.id;
        this.typeIdToSidebarSection[typeId].addProfileHeader(profile);
        if (!this.visibleView || this.visibleView === this.launcherView) {
            this.showProfile(profile);
        }
    }
    removeProfileHeader(profile) {
        if (profile.profileType().profileBeingRecorded() === profile) {
            this.profileBeingRecordedRemoved();
        }
        const i = this.indexOfViewForProfile(profile);
        if (i !== -1) {
            this.profileToView.splice(i, 1);
        }
        const typeId = profile.profileType().id;
        const sectionIsEmpty = this.typeIdToSidebarSection[typeId].removeProfileHeader(profile);
        // No other item will be selected if there aren't any other profiles, so
        // make sure that view gets cleared when the last profile is removed.
        if (sectionIsEmpty) {
            this.profilesItemTreeElement.select();
            this.showLauncherView();
        }
    }
    showProfile(profile) {
        if (!profile ||
            (profile.profileType().profileBeingRecorded() === profile) && !profile.profileType().hasTemporaryView()) {
            return null;
        }
        const view = this.viewForProfile(profile);
        if (view === this.visibleView) {
            return view;
        }
        this.closeVisibleView();
        view.show(this.profileViews);
        this.toolbarElement.classList.remove('hidden');
        this.visibleView = view;
        const profileTypeSection = this.typeIdToSidebarSection[profile.profileType().id];
        const sidebarElement = profileTypeSection.sidebarElementForProfile(profile);
        if (sidebarElement) {
            sidebarElement.revealAndSelect();
        }
        this.profileViewToolbar.removeToolbarItems();
        void view.toolbarItems().then(items => {
            items.map(item => this.profileViewToolbar.appendToolbarItem(item));
        });
        return view;
    }
    showObject(_snapshotObjectId, _perspectiveName) {
    }
    async linkifyObject(_nodeIndex) {
        return null;
    }
    viewForProfile(profile) {
        const index = this.indexOfViewForProfile(profile);
        if (index !== -1) {
            return this.profileToView[index].view;
        }
        const view = profile.createView(this);
        view.element.classList.add('profile-view');
        this.profileToView.push({ profile: profile, view: view });
        return view;
    }
    indexOfViewForProfile(profile) {
        return this.profileToView.findIndex(item => item.profile === profile);
    }
    closeVisibleView() {
        if (this.visibleView) {
            this.visibleView.detach();
        }
        delete this.visibleView;
    }
    focus() {
        this.sidebarTree.focus();
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([objectValueStyles, profilesPanelStyles, heapProfilerStyles]);
        this.sidebarTree.registerCSSFiles([profilesSidebarTreeStyles]);
    }
}
export class ProfileTypeSidebarSection extends UI.TreeOutline.TreeElement {
    dataDisplayDelegate;
    profileTreeElements;
    profileGroups;
    constructor(dataDisplayDelegate, profileType) {
        super(profileType.treeItemTitle, true);
        this.selectable = false;
        this.dataDisplayDelegate = dataDisplayDelegate;
        this.profileTreeElements = [];
        this.profileGroups = {};
        this.expand();
        this.hidden = true;
        this.setCollapsible(false);
    }
    addProfileHeader(profile) {
        this.hidden = false;
        const profileType = profile.profileType();
        let sidebarParent = this;
        const profileTreeElement = profile.createSidebarTreeElement(this.dataDisplayDelegate);
        this.profileTreeElements.push(profileTreeElement);
        if (!profile.fromFile() && profileType.profileBeingRecorded() !== profile) {
            const profileTitle = profile.title;
            let group = this.profileGroups[profileTitle];
            if (!group) {
                group = new ProfileGroup();
                this.profileGroups[profileTitle] = group;
            }
            group.profileSidebarTreeElements.push(profileTreeElement);
            const groupSize = group.profileSidebarTreeElements.length;
            if (groupSize === 2) {
                // Make a group UI.TreeOutline.TreeElement now that there are 2 profiles.
                group.sidebarTreeElement = new ProfileGroupSidebarTreeElement(this.dataDisplayDelegate, profile.title);
                const firstProfileTreeElement = group.profileSidebarTreeElements[0];
                // Insert at the same index for the first profile of the group.
                const index = this.children().indexOf(firstProfileTreeElement);
                this.insertChild(group.sidebarTreeElement, index);
                // Move the first profile to the group.
                const selected = firstProfileTreeElement.selected;
                this.removeChild(firstProfileTreeElement);
                group.sidebarTreeElement.appendChild(firstProfileTreeElement);
                if (selected) {
                    firstProfileTreeElement.revealAndSelect();
                }
                firstProfileTreeElement.setSmall(true);
                firstProfileTreeElement.setMainTitle(i18nString(UIStrings.runD, { PH1: 1 }));
                if (this.treeOutline) {
                    this.treeOutline.element.classList.add('some-expandable');
                }
            }
            if (groupSize >= 2) {
                sidebarParent = group.sidebarTreeElement;
                profileTreeElement.setSmall(true);
                profileTreeElement.setMainTitle(i18nString(UIStrings.runD, { PH1: groupSize }));
            }
        }
        if (sidebarParent) {
            sidebarParent.appendChild(profileTreeElement);
        }
    }
    removeProfileHeader(profile) {
        const index = this.sidebarElementIndex(profile);
        if (index === -1) {
            return false;
        }
        const profileTreeElement = this.profileTreeElements[index];
        this.profileTreeElements.splice(index, 1);
        let sidebarParent = this;
        const group = this.profileGroups[profile.title];
        if (group) {
            const groupElements = group.profileSidebarTreeElements;
            groupElements.splice(groupElements.indexOf(profileTreeElement), 1);
            if (groupElements.length === 1) {
                // Move the last profile out of its group and remove the group.
                const pos = sidebarParent.children().indexOf(group.sidebarTreeElement);
                if (group.sidebarTreeElement) {
                    group.sidebarTreeElement.removeChild(groupElements[0]);
                }
                this.insertChild(groupElements[0], pos);
                groupElements[0].setSmall(false);
                groupElements[0].setMainTitle(profile.title);
                if (group.sidebarTreeElement) {
                    this.removeChild(group.sidebarTreeElement);
                }
            }
            if (groupElements.length !== 0) {
                sidebarParent = group.sidebarTreeElement;
            }
        }
        if (sidebarParent) {
            sidebarParent.removeChild(profileTreeElement);
        }
        profileTreeElement.dispose();
        if (this.childCount()) {
            return false;
        }
        this.hidden = true;
        return true;
    }
    sidebarElementForProfile(profile) {
        const index = this.sidebarElementIndex(profile);
        return index === -1 ? null : this.profileTreeElements[index];
    }
    sidebarElementIndex(profile) {
        const elements = this.profileTreeElements;
        for (let i = 0; i < elements.length; i++) {
            if (elements[i].profile === profile) {
                return i;
            }
        }
        return -1;
    }
    onattach() {
        this.listItemElement.classList.add('profiles-tree-section');
    }
}
export class ProfileGroup {
    profileSidebarTreeElements;
    sidebarTreeElement;
    constructor() {
        this.profileSidebarTreeElements = [];
        this.sidebarTreeElement = null;
    }
}
export class ProfileGroupSidebarTreeElement extends UI.TreeOutline.TreeElement {
    dataDisplayDelegate;
    profileTitle;
    toggleOnClick;
    constructor(dataDisplayDelegate, title) {
        super('', true);
        this.selectable = false;
        this.dataDisplayDelegate = dataDisplayDelegate;
        this.profileTitle = title;
        this.expand();
        this.toggleOnClick = true;
    }
    onselect() {
        const hasChildren = this.childCount() > 0;
        if (hasChildren) {
            const lastChild = this.lastChild();
            if (lastChild instanceof ProfileSidebarTreeElement) {
                this.dataDisplayDelegate.showProfile(lastChild.profile);
            }
        }
        return hasChildren;
    }
    onattach() {
        this.listItemElement.classList.add('profile-group-sidebar-tree-item');
        this.listItemElement.createChild('div', 'icon');
        this.listItemElement.createChild('div', 'titles no-subtitle')
            .createChild('span', 'title-container')
            .createChild('span', 'title')
            .textContent = this.profileTitle;
    }
}
export class ProfilesSidebarTreeElement extends UI.TreeOutline.TreeElement {
    panel;
    constructor(panel) {
        super('', false);
        this.selectable = true;
        this.panel = panel;
    }
    onselect() {
        this.panel.showLauncherView();
        return true;
    }
    onattach() {
        this.listItemElement.classList.add('profile-launcher-view-tree-item');
        this.listItemElement.createChild('div', 'icon');
        this.listItemElement.createChild('div', 'titles no-subtitle')
            .createChild('span', 'title-container')
            .createChild('span', 'title')
            .textContent = i18nString(UIStrings.profiles);
    }
}
let jsProfilerPanelInstance;
export class JSProfilerPanel extends ProfilesPanel {
    constructor() {
        const registry = instance;
        super('js_profiler', [registry.cpuProfileType], 'profiler.js-toggle-recording');
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!jsProfilerPanelInstance || forceNew) {
            jsProfilerPanelInstance = new JSProfilerPanel();
        }
        return jsProfilerPanelInstance;
    }
    wasShown() {
        super.wasShown();
        UI.Context.Context.instance().setFlavor(JSProfilerPanel, this);
    }
    willHide() {
        UI.Context.Context.instance().setFlavor(JSProfilerPanel, null);
    }
    handleAction(_context, _actionId) {
        const panel = UI.Context.Context.instance().flavor(JSProfilerPanel);
        if (panel instanceof JSProfilerPanel) {
            panel.toggleRecord();
        }
        else {
            throw new Error('non-null JSProfilerPanel expected!');
        }
        return true;
    }
}
//# sourceMappingURL=ProfilesPanel.js.map