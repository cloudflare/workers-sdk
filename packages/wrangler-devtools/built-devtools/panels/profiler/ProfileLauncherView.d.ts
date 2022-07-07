import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { ProfileType } from './ProfileHeader.js';
import type { ProfilesPanel } from './ProfilesPanel.js';
declare const ProfileLauncherView_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.ProfileTypeSelected>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.ProfileTypeSelected>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.ProfileTypeSelected>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.ProfileTypeSelected): boolean;
    dispatchEventToListeners<T_3 extends Events.ProfileTypeSelected>(eventType: import("../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class ProfileLauncherView extends ProfileLauncherView_base {
    readonly panel: ProfilesPanel;
    private contentElementInternal;
    readonly selectedProfileTypeSetting: Common.Settings.Setting<string>;
    profileTypeHeaderElement: HTMLElement;
    readonly profileTypeSelectorForm: HTMLElement;
    controlButton: HTMLButtonElement;
    readonly loadButton: HTMLButtonElement;
    recordButtonEnabled: boolean;
    typeIdToOptionElementAndProfileType: Map<string, {
        optionElement: HTMLInputElement;
        profileType: ProfileType;
    }>;
    isProfiling?: boolean;
    isInstantProfile?: boolean;
    isEnabled?: boolean;
    constructor(profilesPanel: ProfilesPanel);
    loadButtonClicked(): void;
    updateControls(): void;
    profileStarted(): void;
    profileFinished(): void;
    updateProfileType(profileType: ProfileType, recordButtonEnabled: boolean): void;
    addProfileType(profileType: ProfileType): void;
    restoreSelectedProfileType(): void;
    controlButtonClicked(): void;
    profileTypeChanged(profileType: ProfileType): void;
    wasShown(): void;
}
export declare enum Events {
    ProfileTypeSelected = "ProfileTypeSelected"
}
export declare type EventTypes = {
    [Events.ProfileTypeSelected]: ProfileType;
};
export {};
