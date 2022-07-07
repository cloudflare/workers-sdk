import { VBox } from './Widget.js';
export declare class TargetCrashedScreen extends VBox {
    private readonly hideCallback;
    constructor(hideCallback: () => void);
    willHide(): void;
}
