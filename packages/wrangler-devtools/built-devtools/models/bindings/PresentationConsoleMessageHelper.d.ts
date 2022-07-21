import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import { LiveLocationPool } from './LiveLocation.js';
export declare class PresentationConsoleMessageManager implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    constructor();
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    private consoleMessageAdded;
    private consoleCleared;
}
export declare class PresentationConsoleMessageHelper {
    #private;
    constructor(debuggerModel: SDK.DebuggerModel.DebuggerModel);
    consoleMessageAdded(message: SDK.ConsoleModel.ConsoleMessage): void;
    private rawLocation;
    private addConsoleMessageToScript;
    private addPendingConsoleMessage;
    private parsedScriptSource;
    consoleCleared(): void;
    private debuggerReset;
}
export declare class PresentationConsoleMessage extends Workspace.UISourceCode.Message {
    #private;
    constructor(message: SDK.ConsoleModel.ConsoleMessage, rawLocation: SDK.DebuggerModel.Location, locationPool: LiveLocationPool);
    private updateLocation;
    dispose(): void;
}
