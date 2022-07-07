import type * as UI from '../../legacy.js';
export declare const history: string[];
export declare class QuickOpenImpl {
    private prefix;
    private readonly prefixes;
    private providers;
    private filteredListWidget;
    constructor();
    static show(query: string): void;
    private addProvider;
    private queryChanged;
    private providerLoadedForTest;
}
export declare class ShowActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ShowActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
