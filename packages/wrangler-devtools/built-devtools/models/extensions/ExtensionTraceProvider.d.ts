import type * as Platform from '../../core/platform/platform.js';
export declare class ExtensionTraceProvider {
    private readonly extensionOrigin;
    private readonly id;
    private readonly categoryName;
    private readonly categoryTooltip;
    constructor(extensionOrigin: string, id: string, categoryName: string, categoryTooltip: string);
    start(session: TracingSession): void;
    stop(): void;
    shortDisplayName(): string;
    longDisplayName(): string;
    persistentIdentifier(): string;
}
export interface TracingSession {
    complete(url: Platform.DevToolsPath.UrlString, timeOffsetMicroseconds: number): void;
}
