import type * as Common from '../../core/common/common.js';
export declare class ProgressIndicator implements Common.Progress.Progress {
    element: HTMLDivElement;
    private readonly shadowRoot;
    private readonly contentElement;
    private labelElement;
    private progressElement;
    private readonly stopButton;
    private isCanceledInternal;
    private worked;
    private isDone?;
    constructor();
    show(parent: Element): void;
    done(): void;
    cancel(): void;
    isCanceled(): boolean;
    setTitle(title: string): void;
    setTotalWork(totalWork: number): void;
    setWorked(worked: number, title?: string): void;
    incrementWorked(worked?: number): void;
}
