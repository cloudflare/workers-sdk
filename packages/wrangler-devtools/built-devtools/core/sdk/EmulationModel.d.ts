import * as Protocol from '../../generated/protocol.js';
import { OverlayModel } from './OverlayModel.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare class EmulationModel extends SDKModel<void> {
    #private;
    constructor(target: Target);
    setTouchEmulationAllowed(touchEmulationAllowed: boolean): void;
    supportsDeviceEmulation(): boolean;
    resetPageScaleFactor(): Promise<void>;
    emulateDevice(metrics: Protocol.Page.SetDeviceMetricsOverrideRequest | null): Promise<void>;
    overlayModel(): OverlayModel | null;
    emulateLocation(location: Location | null): Promise<void>;
    emulateDeviceOrientation(deviceOrientation: DeviceOrientation | null): Promise<void>;
    setIdleOverride(emulationParams: {
        isUserActive: boolean;
        isScreenUnlocked: boolean;
    }): Promise<void>;
    clearIdleOverride(): Promise<void>;
    private emulateCSSMedia;
    private emulateAutoDarkMode;
    private emulateVisionDeficiency;
    private setLocalFontsDisabled;
    private setDisabledImageTypes;
    setCPUThrottlingRate(rate: number): Promise<void>;
    setHardwareConcurrency(hardwareConcurrency: number): Promise<void>;
    emulateTouch(enabled: boolean, mobile: boolean): Promise<void>;
    overrideEmulateTouch(enabled: boolean): Promise<void>;
    private updateTouch;
    private updateCssMedia;
}
export declare class Location {
    latitude: number;
    longitude: number;
    timezoneId: string;
    locale: string;
    error: boolean;
    constructor(latitude: number, longitude: number, timezoneId: string, locale: string, error: boolean);
    static parseSetting(value: string): Location;
    static parseUserInput(latitudeString: string, longitudeString: string, timezoneId: string, locale: string): Location | null;
    static latitudeValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static longitudeValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static timezoneIdValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static localeValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    toSetting(): string;
    static defaultGeoMockAccuracy: number;
}
export declare class DeviceOrientation {
    alpha: number;
    beta: number;
    gamma: number;
    constructor(alpha: number, beta: number, gamma: number);
    static parseSetting(value: string): DeviceOrientation;
    static parseUserInput(alphaString: string, betaString: string, gammaString: string): DeviceOrientation | null;
    static angleRangeValidator(value: string, interval: {
        minimum: number;
        maximum: number;
    }): {
        valid: boolean;
        errorMessage: undefined;
    };
    static alphaAngleValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static betaAngleValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static gammaAngleValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    toSetting(): string;
}
