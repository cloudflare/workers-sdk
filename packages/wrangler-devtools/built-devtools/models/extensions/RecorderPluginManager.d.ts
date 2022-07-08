import type { RecorderExtensionEndpoint } from './RecorderExtensionEndpoint.js';
export declare class RecorderPluginManager {
    #private;
    static instance(): RecorderPluginManager;
    addPlugin(plugin: RecorderExtensionEndpoint): void;
    removePlugin(plugin: RecorderExtensionEndpoint): void;
    plugins(): RecorderExtensionEndpoint[];
}
