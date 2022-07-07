import * as Workspace from '../workspace/workspace.js';
export declare class Automapping {
    private readonly workspace;
    private readonly onStatusAdded;
    private readonly onStatusRemoved;
    private readonly statuses;
    private readonly fileSystemUISourceCodes;
    private readonly sweepThrottler;
    private readonly sourceCodeToProcessingPromiseMap;
    private readonly sourceCodeToAutoMappingStatusMap;
    private readonly sourceCodeToMetadataMap;
    private readonly filesIndex;
    private readonly projectFoldersIndex;
    private readonly activeFoldersIndex;
    private readonly interceptors;
    constructor(workspace: Workspace.Workspace.WorkspaceImpl, onStatusAdded: (arg0: AutomappingStatus) => Promise<void>, onStatusRemoved: (arg0: AutomappingStatus) => Promise<void>);
    addNetworkInterceptor(interceptor: (arg0: Workspace.UISourceCode.UISourceCode) => boolean): void;
    scheduleRemap(): void;
    private scheduleSweep;
    private onSweepHappenedForTest;
    private onProjectRemoved;
    private onProjectAdded;
    private onUISourceCodeAdded;
    private onUISourceCodeRemoved;
    private onUISourceCodeRenamed;
    computeNetworkStatus(networkSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
    private prevalidationFailedForTest;
    private onBindingFailedForTest;
    private clearNetworkStatus;
    private createBinding;
    private pullMetadatas;
    private filterWithMetadata;
}
export declare class AutomappingStatus {
    network: Workspace.UISourceCode.UISourceCode;
    fileSystem: Workspace.UISourceCode.UISourceCode;
    exactMatch: boolean;
    constructor(network: Workspace.UISourceCode.UISourceCode, fileSystem: Workspace.UISourceCode.UISourceCode, exactMatch: boolean);
}
