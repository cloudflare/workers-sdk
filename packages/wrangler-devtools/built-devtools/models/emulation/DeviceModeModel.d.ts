import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { EmulatedDevice, Mode } from './EmulatedDevices.js';
export declare class DeviceModeModel extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.EmulationModel.EmulationModel> {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: null;
    }): DeviceModeModel;
    static widthValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static heightValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static scaleValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    get scaleSettingInternal(): Common.Settings.Setting<number>;
    setAvailableSize(availableSize: UI.Geometry.Size, preferredSize: UI.Geometry.Size): void;
    emulate(type: Type, device: EmulatedDevice | null, mode: Mode | null, scale?: number): void;
    setWidth(width: number): void;
    setWidthAndScaleToFit(width: number): void;
    setHeight(height: number): void;
    setHeightAndScaleToFit(height: number): void;
    setScale(scale: number): void;
    device(): EmulatedDevice | null;
    mode(): Mode | null;
    type(): Type;
    screenImage(): string;
    outlineImage(): string;
    outlineRect(): Rect | null;
    screenRect(): Rect;
    visiblePageRect(): Rect;
    scale(): number;
    fitScale(): number;
    appliedDeviceSize(): UI.Geometry.Size;
    appliedDeviceScaleFactor(): number;
    appliedUserAgentType(): UA;
    isFullHeight(): boolean;
    private isMobile;
    enabledSetting(): Common.Settings.Setting<boolean>;
    scaleSetting(): Common.Settings.Setting<number>;
    uaSetting(): Common.Settings.Setting<UA>;
    deviceScaleFactorSetting(): Common.Settings.Setting<number>;
    deviceOutlineSetting(): Common.Settings.Setting<boolean>;
    toolbarControlsEnabledSetting(): Common.Settings.Setting<boolean>;
    reset(): void;
    modelAdded(emulationModel: SDK.EmulationModel.EmulationModel): void;
    modelRemoved(emulationModel: SDK.EmulationModel.EmulationModel): void;
    inspectedURL(): string | null;
    private onFrameChange;
    private scaleSettingChanged;
    private widthSettingChanged;
    private heightSettingChanged;
    private uaSettingChanged;
    private deviceScaleFactorSettingChanged;
    private deviceOutlineSettingChanged;
    private preferredScaledWidth;
    private preferredScaledHeight;
    private currentOutline;
    private currentInsets;
    private getScreenOrientationType;
    private calculateAndEmulate;
    private calculateFitScale;
    setSizeAndScaleToFit(width: number, height: number): void;
    private applyUserAgent;
    private applyDeviceMetrics;
    exitHingeMode(): void;
    webPlatformExperimentalFeaturesEnabled(): boolean;
    shouldReportDisplayFeature(): boolean;
    captureScreenshot(fullSize: boolean, clip?: Protocol.Page.Viewport): Promise<string | null>;
    private applyTouch;
    private showHingeIfApplicable;
    private getDisplayFeatureOrientation;
    private getDisplayFeature;
}
export declare class Insets {
    left: number;
    top: number;
    right: number;
    bottom: number;
    constructor(left: number, top: number, right: number, bottom: number);
    isEqual(insets: Insets | null): boolean;
}
export declare class Rect {
    left: number;
    top: number;
    width: number;
    height: number;
    constructor(left: number, top: number, width: number, height: number);
    isEqual(rect: Rect | null): boolean;
    scale(scale: number): Rect;
    relativeTo(origin: Rect): Rect;
    rebaseTo(origin: Rect): Rect;
}
export declare const enum Events {
    Updated = "Updated"
}
export declare type EventTypes = {
    [Events.Updated]: void;
};
export declare enum Type {
    None = "None",
    Responsive = "Responsive",
    Device = "Device"
}
export declare enum UA {
    Mobile = "Mobile",
    MobileNoTouch = "Mobile (no touch)",
    Desktop = "Desktop",
    DesktopTouch = "Desktop (touch)"
}
export declare const MinDeviceSize = 50;
export declare const MaxDeviceSize = 9999;
export declare const MinDeviceScaleFactor = 0;
export declare const MaxDeviceScaleFactor = 10;
export declare const MaxDeviceNameLength = 50;
export declare const defaultMobileScaleFactor = 2;
