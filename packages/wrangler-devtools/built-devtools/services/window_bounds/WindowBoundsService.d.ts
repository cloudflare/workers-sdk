export interface WindowBoundsService {
    getDevToolsBoundingElement(): HTMLElement;
}
export declare class WindowBoundsServiceImpl implements WindowBoundsService {
    static instance(opts?: {
        forceNew: boolean | null;
    }): WindowBoundsServiceImpl;
    getDevToolsBoundingElement(): HTMLElement;
}
