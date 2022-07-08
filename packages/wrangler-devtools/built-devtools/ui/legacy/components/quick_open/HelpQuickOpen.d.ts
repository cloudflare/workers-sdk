import { Provider } from './FilteredListWidget.js';
export declare class HelpQuickOpen extends Provider {
    private providers;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): HelpQuickOpen;
    private addProvider;
    itemCount(): number;
    itemKeyAt(itemIndex: number): string;
    itemScoreAt(itemIndex: number, _query: string): number;
    renderItem(itemIndex: number, _query: string, titleElement: Element, _subtitleElement: Element): void;
    selectItem(itemIndex: number | null, _promptValue: string): void;
    renderAsTwoRows(): boolean;
}
