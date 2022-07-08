import * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import type * as Platform from '../platform/platform.js';
import { FrontendMessageSource, FrontendMessageType } from './ConsoleModelTypes.js';
export { FrontendMessageSource, FrontendMessageType } from './ConsoleModelTypes.js';
import { RemoteObject } from './RemoteObject.js';
import type { ExecutionContext } from './RuntimeModel.js';
import { RuntimeModel } from './RuntimeModel.js';
import type { Target } from './Target.js';
import type { Observer } from './TargetManager.js';
export declare class ConsoleModel extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements Observer {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ConsoleModel;
    targetAdded(target: Target): void;
    private initTarget;
    targetRemoved(target: Target): void;
    evaluateCommandInConsole(executionContext: ExecutionContext, originatingMessage: ConsoleMessage, expression: string, useCommandLineAPI: boolean): Promise<void>;
    addCommandMessage(executionContext: ExecutionContext, text: string): ConsoleMessage;
    addMessage(msg: ConsoleMessage): void;
    private exceptionThrown;
    private exceptionRevoked;
    private consoleAPICalled;
    private queryObjectRequested;
    private clearIfNecessary;
    private mainFrameNavigated;
    private consoleProfileStarted;
    private consoleProfileFinished;
    private addConsoleProfileMessage;
    private incrementErrorWarningCount;
    messages(): ConsoleMessage[];
    requestClearMessages(): void;
    private clear;
    errors(): number;
    warnings(): number;
    violations(): number;
    saveToTempVariable(currentExecutionContext: ExecutionContext | null, remoteObject: RemoteObject | null): Promise<void>;
}
export declare enum Events {
    ConsoleCleared = "ConsoleCleared",
    MessageAdded = "MessageAdded",
    MessageUpdated = "MessageUpdated",
    CommandEvaluated = "CommandEvaluated"
}
export interface CommandEvaluatedEvent {
    result: RemoteObject;
    commandMessage: ConsoleMessage;
    exceptionDetails?: Protocol.Runtime.ExceptionDetails | undefined;
}
export declare type EventTypes = {
    [Events.ConsoleCleared]: void;
    [Events.MessageAdded]: ConsoleMessage;
    [Events.MessageUpdated]: ConsoleMessage;
    [Events.CommandEvaluated]: CommandEvaluatedEvent;
};
export interface AffectedResources {
    requestId?: Protocol.Network.RequestId;
    issueId?: Protocol.Audits.IssueId;
}
export interface ConsoleMessageDetails {
    type?: MessageType;
    url?: Platform.DevToolsPath.UrlString;
    line?: number;
    column?: number;
    parameters?: (string | RemoteObject | Protocol.Runtime.RemoteObject)[];
    stackTrace?: Protocol.Runtime.StackTrace;
    timestamp?: number;
    executionContextId?: number;
    scriptId?: Protocol.Runtime.ScriptId;
    workerId?: string;
    context?: string;
    affectedResources?: AffectedResources;
    category?: Protocol.Log.LogEntryCategory;
}
export declare class ConsoleMessage {
    #private;
    source: MessageSource;
    level: Protocol.Log.LogEntryLevel | null;
    messageText: string;
    readonly type: MessageType;
    url: Platform.DevToolsPath.UrlString | undefined;
    line: number;
    column: number;
    parameters: (string | RemoteObject | Protocol.Runtime.RemoteObject)[] | undefined;
    stackTrace: Protocol.Runtime.StackTrace | undefined;
    timestamp: number;
    scriptId?: Protocol.Runtime.ScriptId;
    workerId?: string;
    context?: string;
    category?: Protocol.Log.LogEntryCategory;
    constructor(runtimeModel: RuntimeModel | null, source: MessageSource, level: Protocol.Log.LogEntryLevel | null, messageText: string, details?: ConsoleMessageDetails);
    getAffectedResources(): AffectedResources | undefined;
    setPageLoadSequenceNumber(pageLoadSequenceNumber: number): void;
    static fromException(runtimeModel: RuntimeModel, exceptionDetails: Protocol.Runtime.ExceptionDetails, messageType?: Protocol.Runtime.ConsoleAPICalledEventType | FrontendMessageType, timestamp?: number, forceUrl?: Platform.DevToolsPath.UrlString, affectedResources?: AffectedResources): ConsoleMessage;
    runtimeModel(): RuntimeModel | null;
    target(): Target | null;
    setOriginatingMessage(originatingMessage: ConsoleMessage): void;
    originatingMessage(): ConsoleMessage | null;
    setExecutionContextId(executionContextId: number): void;
    getExecutionContextId(): number;
    getExceptionId(): number | undefined;
    setExceptionId(exceptionId: number): void;
    isGroupMessage(): boolean;
    isGroupStartMessage(): boolean;
    isErrorOrWarning(): boolean;
    isGroupable(): boolean;
    groupCategoryKey(): string;
    isEqual(msg: ConsoleMessage | null): boolean;
}
export declare type MessageSource = Protocol.Log.LogEntrySource | FrontendMessageSource;
export declare type MessageLevel = Protocol.Log.LogEntryLevel;
export declare type MessageType = Protocol.Runtime.ConsoleAPICalledEventType | FrontendMessageType;
export declare const MessageSourceDisplayName: Map<MessageSource, string>;
