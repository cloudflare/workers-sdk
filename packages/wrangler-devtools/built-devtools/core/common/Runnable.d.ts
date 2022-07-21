export interface Runnable {
    run(): Promise<void>;
}
declare type LateInitializationLoader = () => Promise<Runnable>;
export interface LateInitializableRunnableSetting {
    id: string;
    loadRunnable: LateInitializationLoader;
}
export declare function registerLateInitializationRunnable(setting: LateInitializableRunnableSetting): void;
export declare function maybeRemoveLateInitializationRunnable(runnableId: string): boolean;
export declare function lateInitializationRunnables(): Array<LateInitializationLoader>;
export declare function registerEarlyInitializationRunnable(runnable: () => Runnable): void;
export declare function earlyInitializationRunnables(): (() => Runnable)[];
export {};
