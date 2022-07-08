import type * as Platform from '../../core/platform/platform.js';
import type * as ReportRenderer from './LighthouseReporterTypes.js';
export interface LighthouseRun {
    inspectedURL: Platform.DevToolsPath.UrlString;
    categoryIDs: string[];
    flags: Record<string, Object | undefined>;
}
/**
 * ProtocolService manages a connection between the frontend (Lighthouse panel) and the Lighthouse worker.
 */
export declare class ProtocolService {
    private targetInfo?;
    private parallelConnection?;
    private lighthouseWorkerPromise?;
    private lighthouseMessageUpdateCallback?;
    attach(): Promise<void>;
    getLocales(): readonly string[];
    startTimespan(currentLighthouseRun: LighthouseRun): Promise<void>;
    collectLighthouseResults(currentLighthouseRun: LighthouseRun): Promise<ReportRenderer.RunnerResult>;
    detach(): Promise<void>;
    registerStatusCallback(callback: (arg0: string) => void): void;
    private dispatchProtocolMessage;
    private initWorker;
    private ensureWorkerExists;
    private onWorkerMessage;
    private sendProtocolMessage;
    private send;
    /** sendWithResponse currently only handles the original startLighthouse request and LHR-filled response. */
    private sendWithResponse;
}
