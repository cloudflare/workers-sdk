import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type { NetworkThrottlingConditionsGroup } from './ThrottlingPresets.js';
export declare class NetworkThrottlingSelector {
    private populateCallback;
    private readonly selectCallback;
    private readonly customNetworkConditionsSetting;
    private options;
    constructor(populateCallback: (arg0: Array<NetworkThrottlingConditionsGroup>) => Array<SDK.NetworkManager.Conditions | null>, selectCallback: (arg0: number) => void, customNetworkConditionsSetting: Common.Settings.Setting<SDK.NetworkManager.Conditions[]>);
    revealAndUpdate(): void;
    optionSelected(conditions: SDK.NetworkManager.Conditions): void;
    private populateOptions;
    /**
     * returns false if selected condition no longer exists
     */
    private networkConditionsChanged;
}
