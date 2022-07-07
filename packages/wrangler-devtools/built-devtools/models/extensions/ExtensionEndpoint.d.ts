declare type Event = {
    event: string;
};
export declare class ExtensionEndpoint {
    private readonly port;
    private nextRequestId;
    private pendingRequests;
    constructor(port: MessagePort);
    sendRequest<ReturnType>(method: string, parameters: unknown): Promise<ReturnType>;
    protected disconnect(): void;
    private onResponse;
    protected handleEvent(_event: Event): void;
}
export {};
