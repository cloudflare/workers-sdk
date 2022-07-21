import * as LighthouseReport from '../../third_party/lighthouse/report/report.js';
import type { RunnerResultArtifacts } from './LighthouseReporterTypes.js';
export declare class LighthouseReportRenderer extends LighthouseReport.ReportRenderer {
    constructor(dom: LighthouseReport.DOM);
    static addViewTraceButton(el: Element, reportUIFeatures: LighthouseReport.ReportUIFeatures, artifacts?: RunnerResultArtifacts): void;
    static linkifyNodeDetails(el: Element): Promise<void>;
    static linkifySourceLocationDetails(el: Element): Promise<void>;
    static handleDarkMode(el: Element): void;
}
export declare class LighthouseReportUIFeatures extends LighthouseReport.ReportUIFeatures {
    private beforePrint;
    private afterPrint;
    constructor(dom: LighthouseReport.DOM);
    setBeforePrint(beforePrint: (() => void) | null): void;
    setAfterPrint(afterPrint: (() => void) | null): void;
    /**
     * Returns the html that recreates this report.
     */
    getReportHtml(): string;
    /**
     * Downloads a file (blob) using the system dialog prompt.
     */
    _saveFile(blob: Blob | File): Promise<void>;
    _print(): Promise<void>;
    getDocument(): Document;
    resetUIState(): void;
}
