import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
import * as ApplicationComponents from './components/components.js';
interface InterestGroupDetailsGetter {
    getInterestGroupDetails: (owner: string, name: string) => Promise<Protocol.Storage.InterestGroupDetails | null>;
}
export declare class InterestGroupStorageView extends UI.SplitWidget.SplitWidget {
    private readonly interestGroupGrid;
    private events;
    private detailsGetter;
    private noDataView;
    private noDisplayView;
    constructor(detailsGetter: InterestGroupDetailsGetter);
    wasShown(): void;
    addEvent(event: Protocol.Storage.InterestGroupAccessedEvent): void;
    clearEvents(): void;
    private onFocus;
    getEventsForTesting(): Array<Protocol.Storage.InterestGroupAccessedEvent>;
    getInterestGroupGridForTesting(): ApplicationComponents.InterestGroupAccessGrid.InterestGroupAccessGrid;
}
export {};
