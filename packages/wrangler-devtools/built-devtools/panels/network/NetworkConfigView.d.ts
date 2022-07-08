import * as Protocol from '../../generated/protocol.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class NetworkConfigView extends UI.Widget.VBox {
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): NetworkConfigView;
    static createUserAgentSelectAndInput(title: string): {
        select: HTMLSelectElement;
        input: HTMLInputElement;
        error: HTMLElement;
    };
    private createSection;
    private createCacheSection;
    private createNetworkThrottlingSection;
    private createUserAgentSection;
    private createAcceptedEncodingSection;
    wasShown(): void;
}
interface UserAgentGroup {
    title: string;
    values: {
        title: string;
        value: string;
        metadata: Protocol.Emulation.UserAgentMetadata | null;
    }[];
}
export declare const userAgentGroups: UserAgentGroup[];
export {};
