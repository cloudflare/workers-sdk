import type { EventPayload } from './TracingManager.js';
export declare class TracingModel {
    #private;
    constructor(backingStorage: BackingStorage);
    static isNestableAsyncPhase(phase: string): boolean;
    static isAsyncBeginPhase(phase: string): boolean;
    static isAsyncPhase(phase: string): boolean;
    static isFlowPhase(phase: string): boolean;
    static isCompletePhase(phase: string): boolean;
    static isTopLevelEvent(event: Event): boolean;
    static extractId(payload: EventPayload): string | undefined;
    static browserMainThread(tracingModel: TracingModel): Thread | null;
    devToolsMetadataEvents(): Event[];
    addEvents(events: EventPayload[]): void;
    tracingComplete(): void;
    dispose(): void;
    adjustTime(offset: number): void;
    private addEvent;
    private addSampleEvent;
    profileGroup(event: Event): ProfileEventsGroup | null;
    minimumRecordTime(): number;
    maximumRecordTime(): number;
    navStartTimes(): Map<string, Event>;
    sortedProcesses(): Process[];
    getProcessByName(name: string): Process | null;
    getProcessById(pid: number): Process | null;
    getThreadByName(processName: string, threadName: string): Thread | null;
    private processPendingAsyncEvents;
    private closeOpenAsyncEvents;
    private addNestableAsyncEvent;
    private addAsyncEvent;
    backingStorage(): BackingStorage;
    parsedCategoriesForString(str: string): Set<string>;
}
export declare enum Phase {
    Begin = "B",
    End = "E",
    Complete = "X",
    Instant = "I",
    AsyncBegin = "S",
    AsyncStepInto = "T",
    AsyncStepPast = "p",
    AsyncEnd = "F",
    NestableAsyncBegin = "b",
    NestableAsyncEnd = "e",
    NestableAsyncInstant = "n",
    FlowBegin = "s",
    FlowStep = "t",
    FlowEnd = "f",
    Metadata = "M",
    Counter = "C",
    Sample = "P",
    CreateObject = "N",
    SnapshotObject = "O",
    DeleteObject = "D"
}
export declare const MetadataEvent: {
    ProcessSortIndex: string;
    ProcessName: string;
    ThreadSortIndex: string;
    ThreadName: string;
};
export declare const LegacyTopLevelEventCategory = "toplevel";
export declare const DevToolsMetadataEventCategory = "disabled-by-default-devtools.timeline";
export declare const DevToolsTimelineEventCategory = "disabled-by-default-devtools.timeline";
export declare abstract class BackingStorage {
    appendString(_string: string): void;
    abstract appendAccessibleString(string: string): () => Promise<string | null>;
    finishWriting(): void;
    reset(): void;
}
export declare class Event {
    #private;
    categoriesString: string;
    name: string;
    phase: Phase;
    startTime: number;
    thread: Thread;
    args: any;
    id: string | null;
    bind_id: string | null;
    ordinal: number;
    selfTime: number;
    endTime?: number;
    duration?: number;
    constructor(categories: string | undefined, name: string, phase: Phase, startTime: number, thread: Thread);
    static fromPayload(payload: EventPayload, thread: Thread): Event;
    static compareStartTime(a: Event | null, b: Event | null): number;
    static orderedCompareStartTime(a: Event, b: Event): number;
    hasCategory(categoryName: string): boolean;
    setEndTime(endTime: number): void;
    addArgs(args: any): void;
    complete(endEvent: Event): void;
    setBackingStorage(_backingStorage: (() => Promise<string | null>) | null): void;
}
export declare class ObjectSnapshot extends Event {
    #private;
    constructor(category: string | undefined, name: string, startTime: number, thread: Thread);
    static fromPayload(payload: EventPayload, thread: Thread): ObjectSnapshot;
    requestObject(callback: (arg0: ObjectSnapshot | null) => void): void;
    objectPromise(): Promise<ObjectSnapshot | null>;
    setBackingStorage(backingStorage: (() => Promise<string | null>) | null): void;
}
export declare class AsyncEvent extends Event {
    steps: Event[];
    causedFrame: boolean;
    constructor(startEvent: Event);
    addStep(event: Event): void;
}
declare class ProfileEventsGroup {
    children: Event[];
    constructor(event: Event);
    addChild(event: Event): void;
}
declare class NamedObject {
    #private;
    model: TracingModel;
    readonly idInternal: number;
    constructor(model: TracingModel, id: number);
    static sort<Item extends NamedObject>(array: Item[]): Item[];
    setName(name: string): void;
    name(): string;
    id(): number;
    setSortIndex(sortIndex: number): void;
    getModel(): TracingModel;
}
export declare class Process extends NamedObject {
    #private;
    readonly threads: Map<number, Thread>;
    constructor(model: TracingModel, id: number);
    threadById(id: number): Thread;
    threadByName(name: string): Thread | null;
    setThreadByName(name: string, thread: Thread): void;
    addEvent(payload: EventPayload): Event | null;
    sortedThreads(): Thread[];
}
export declare class Thread extends NamedObject {
    #private;
    constructor(process: Process, id: number);
    tracingComplete(): void;
    addEvent(payload: EventPayload): Event | null;
    addAsyncEvent(asyncEvent: AsyncEvent): void;
    setName(name: string): void;
    process(): Process;
    events(): Event[];
    asyncEvents(): AsyncEvent[];
    removeEventsByName(name: string): Event[];
}
export {};
