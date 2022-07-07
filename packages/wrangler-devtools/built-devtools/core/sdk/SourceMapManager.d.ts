import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import type { FrameAssociated } from './FrameAssociated.js';
import type { Target } from './Target.js';
import type { SourceMap } from './SourceMap.js';
export declare class SourceMapManager<T extends FrameAssociated> extends Common.ObjectWrapper.ObjectWrapper<EventTypes<T>> {
    #private;
    constructor(target: Target);
    setEnabled(isEnabled: boolean): void;
    private getBaseUrl;
    private inspectedURLChanged;
    sourceMapForClient(client: T): SourceMap | null;
    sourceMapForClientPromise(client: T): Promise<SourceMap | null>;
    clientsForSourceMap(sourceMap: SourceMap): T[];
    private getSourceMapId;
    private resolveRelativeURLs;
    attachSourceMap(client: T, relativeSourceURL: Platform.DevToolsPath.UrlString | undefined, relativeSourceMapURL: Platform.DevToolsPath.UrlString | undefined): void;
    detachSourceMap(client: T): void;
    private sourceMapLoadedForTest;
    dispose(): void;
}
export declare enum Events {
    SourceMapWillAttach = "SourceMapWillAttach",
    SourceMapFailedToAttach = "SourceMapFailedToAttach",
    SourceMapAttached = "SourceMapAttached",
    SourceMapDetached = "SourceMapDetached"
}
export declare type EventTypes<T extends FrameAssociated> = {
    [Events.SourceMapWillAttach]: {
        client: T;
    };
    [Events.SourceMapFailedToAttach]: {
        client: T;
    };
    [Events.SourceMapAttached]: {
        client: T;
        sourceMap: SourceMap;
    };
    [Events.SourceMapDetached]: {
        client: T;
        sourceMap: SourceMap;
    };
};
