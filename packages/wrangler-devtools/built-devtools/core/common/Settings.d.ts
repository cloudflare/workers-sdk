import type * as Platform from '../platform/platform.js';
import type { Color } from './Color.js';
import { Format } from './Color.js';
import type { GenericEvents, EventDescriptor, EventTargetEvent } from './EventTarget.js';
import { ObjectWrapper } from './Object.js';
import { getLocalizedSettingsCategory, getRegisteredSettings, maybeRemoveSettingExtension, type RegExpSettingItem, registerSettingExtension, registerSettingsForTest, resetSettings, SettingCategory, type SettingExtensionOption, type SettingRegistration, SettingType } from './SettingRegistration.js';
export declare class Settings {
    #private;
    private readonly syncedStorage;
    readonly globalStorage: SettingsStorage;
    private readonly localStorage;
    settingNameSet: Set<string>;
    orderValuesBySettingCategory: Map<SettingCategory, Set<number>>;
    readonly moduleSettings: Map<string, Setting<unknown>>;
    private constructor();
    static hasInstance(): boolean;
    static instance(opts?: {
        forceNew: boolean | null;
        syncedStorage: SettingsStorage | null;
        globalStorage: SettingsStorage | null;
        localStorage: SettingsStorage | null;
    }): Settings;
    static removeInstance(): void;
    private registerModuleSetting;
    moduleSetting<T = any>(settingName: string): Setting<T>;
    settingForTest(settingName: string): Setting<unknown>;
    createSetting<T>(key: string, defaultValue: T, storageType?: SettingStorageType): Setting<T>;
    createLocalSetting<T>(key: string, defaultValue: T): Setting<T>;
    createRegExpSetting(key: string, defaultValue: string, regexFlags?: string, storageType?: SettingStorageType): RegExpSetting;
    clearAll(): void;
    private storageFromType;
    getRegistry(): Map<string, Setting<unknown>>;
}
export interface SettingsBackingStore {
    register(setting: string): void;
    get(setting: string): Promise<string>;
    set(setting: string, value: string): void;
    remove(setting: string): void;
    clear(): void;
}
export declare const NOOP_STORAGE: SettingsBackingStore;
export declare class SettingsStorage {
    private object;
    private readonly backingStore;
    private readonly storagePrefix;
    constructor(object: Record<string, string>, backingStore?: SettingsBackingStore, storagePrefix?: string);
    register(name: string): void;
    set(name: string, value: string): void;
    has(name: string): boolean;
    get(name: string): string;
    forceGet(originalName: string): Promise<string>;
    remove(name: string): void;
    removeAll(): void;
    dumpSizes(): void;
}
export declare class Setting<V> {
    #private;
    readonly name: string;
    readonly defaultValue: V;
    private readonly eventSupport;
    readonly storage: SettingsStorage;
    constructor(name: string, defaultValue: V, eventSupport: ObjectWrapper<GenericEvents>, storage: SettingsStorage);
    setSerializer(serializer: Serializer<unknown, V>): void;
    addChangeListener(listener: (arg0: EventTargetEvent<V>) => void, thisObject?: Object): EventDescriptor;
    removeChangeListener(listener: (arg0: EventTargetEvent<V>) => void, thisObject?: Object): void;
    title(): string;
    setTitleFunction(titleFunction: (() => Platform.UIString.LocalizedString) | undefined): void;
    setTitle(title: string): void;
    setRequiresUserAction(requiresUserAction: boolean): void;
    disabled(): boolean;
    setDisabled(disabled: boolean): void;
    get(): V;
    forceGet(): Promise<V>;
    set(value: V): void;
    setRegistration(registration: SettingRegistration): void;
    type(): SettingType | null;
    options(): SimpleSettingOption[];
    reloadRequired(): boolean | null;
    category(): SettingCategory | null;
    tags(): string | null;
    order(): number | null;
    private printSettingsSavingError;
}
export declare class RegExpSetting extends Setting<any> {
    #private;
    constructor(name: string, defaultValue: string, eventSupport: ObjectWrapper<GenericEvents>, storage: SettingsStorage, regexFlags?: string);
    get(): string;
    getAsArray(): RegExpSettingItem[];
    set(value: string): void;
    setAsArray(value: RegExpSettingItem[]): void;
    asRegExp(): RegExp | null;
}
export declare class VersionController {
    static get currentVersionName(): string;
    static get currentVersion(): number;
    updateVersion(): void;
    private methodsToRunToUpdateVersion;
    private updateVersionFrom0To1;
    private updateVersionFrom1To2;
    private updateVersionFrom2To3;
    private updateVersionFrom3To4;
    private updateVersionFrom4To5;
    private updateVersionFrom5To6;
    private updateVersionFrom6To7;
    private updateVersionFrom7To8;
    private updateVersionFrom8To9;
    private updateVersionFrom9To10;
    private updateVersionFrom10To11;
    private updateVersionFrom11To12;
    private updateVersionFrom12To13;
    private updateVersionFrom13To14;
    private updateVersionFrom14To15;
    private updateVersionFrom15To16;
    private updateVersionFrom16To17;
    private updateVersionFrom17To18;
    private updateVersionFrom18To19;
    private updateVersionFrom19To20;
    private updateVersionFrom20To21;
    private updateVersionFrom21To22;
    private updateVersionFrom22To23;
    private updateVersionFrom23To24;
    private updateVersionFrom24To25;
    private updateVersionFrom25To26;
    private updateVersionFrom26To27;
    private updateVersionFrom27To28;
    private updateVersionFrom28To29;
    private updateVersionFrom29To30;
    private updateVersionFrom30To31;
    private migrateSettingsFromLocalStorage;
    private clearBreakpointsWhenTooMany;
}
export declare enum SettingStorageType {
    /**
     * Synced storage persists settings with the active Chrome profile but also
     * syncs the settings across devices via Chrome Sync.
     */
    Synced = "Synced",
    /** Global storage persists settings with the active Chrome profile */
    Global = "Global",
    /** Uses Window.localStorage */
    Local = "Local",
    /** Session storage dies when DevTools window closes */
    Session = "Session"
}
export declare function moduleSetting(settingName: string): Setting<unknown>;
export declare function settingForTest(settingName: string): Setting<unknown>;
export declare function detectColorFormat(color: Color): Format;
export { getLocalizedSettingsCategory, getRegisteredSettings, maybeRemoveSettingExtension, registerSettingExtension, RegExpSettingItem, SettingCategory, SettingExtensionOption, SettingRegistration, SettingType, registerSettingsForTest, resetSettings, };
export interface Serializer<I, O> {
    stringify: (value: I) => string;
    parse: (value: string) => O;
}
export interface SimpleSettingOption {
    value: string | boolean;
    title: string;
    text?: string;
    raw?: boolean;
}
