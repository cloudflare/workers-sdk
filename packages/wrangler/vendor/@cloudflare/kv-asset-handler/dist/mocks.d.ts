export declare const getEvent: (request: Request) => any;
export declare const mockKV: (store: any) => {
    get: (path: string) => any;
};
export declare const mockManifest: () => string;
export declare const mockCaches: () => {
    default: {
        match(key: any): Promise<any>;
        put(key: any, val: Response): Promise<void>;
    };
};
export declare function mockGlobal(): void;
export declare const sleep: (milliseconds: number) => Promise<unknown>;
