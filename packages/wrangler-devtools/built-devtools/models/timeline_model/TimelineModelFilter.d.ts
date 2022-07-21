import type * as SDK from '../../core/sdk/sdk.js';
import { RecordType } from './TimelineModel.js';
export declare class TimelineModelFilter {
    accept(_event: SDK.TracingModel.Event): boolean;
}
export declare class TimelineVisibleEventsFilter extends TimelineModelFilter {
    private readonly visibleTypes;
    constructor(visibleTypes: string[]);
    accept(event: SDK.TracingModel.Event): boolean;
    static eventType(event: SDK.TracingModel.Event): RecordType;
}
export declare class TimelineInvisibleEventsFilter extends TimelineModelFilter {
    private invisibleTypes;
    constructor(invisibleTypes: string[]);
    accept(event: SDK.TracingModel.Event): boolean;
}
export declare class ExclusiveNameFilter extends TimelineModelFilter {
    private excludeNames;
    constructor(excludeNames: string[]);
    accept(event: SDK.TracingModel.Event): boolean;
}
