import * as QuickOpen from '../../ui/legacy/components/quick_open/quick_open.js';
export declare class SnippetsQuickOpen extends QuickOpen.FilteredListWidget.Provider {
    private snippets;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): SnippetsQuickOpen;
    selectItem(itemIndex: number | null, _promptValue: string): void;
    notFoundText(_query: string): string;
    attach(): void;
    detach(): void;
    itemScoreAt(itemIndex: number, query: string): number;
    itemCount(): number;
    itemKeyAt(itemIndex: number): string;
    renderItem(itemIndex: number, query: string, titleElement: Element, _subtitleElement: Element): void;
}
