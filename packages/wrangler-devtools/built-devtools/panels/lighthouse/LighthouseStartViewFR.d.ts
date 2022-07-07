import { StartView } from './LighthouseStartView.js';
export declare class StartViewFR extends StartView {
    changeFormMode?: (mode: string) => void;
    protected render(): void;
    private populateStartButton;
    refresh(): void;
    onResize(): void;
}
