export declare class WorkerWrapper {
    #private;
    private constructor();
    static fromURL(url: URL): WorkerWrapper;
    postMessage(message: unknown): void;
    dispose(): void;
    terminate(): void;
    set onmessage(listener: (event: MessageEvent) => void);
    set onerror(listener: (event: Event) => void);
}
