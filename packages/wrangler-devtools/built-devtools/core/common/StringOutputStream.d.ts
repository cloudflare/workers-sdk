export interface OutputStream {
    write(data: string): Promise<void>;
    close(): Promise<void>;
}
export declare class StringOutputStream implements OutputStream {
    #private;
    constructor();
    write(chunk: string): Promise<void>;
    close(): Promise<void>;
    data(): string;
}
