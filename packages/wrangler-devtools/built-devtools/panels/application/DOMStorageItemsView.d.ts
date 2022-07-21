import { DOMStorage } from './DOMStorageModel.js';
import { StorageItemsView } from './StorageItemsView.js';
export declare class DOMStorageItemsView extends StorageItemsView {
    private domStorage;
    private dataGrid;
    private readonly splitWidget;
    private readonly previewPanel;
    private preview;
    private previewValue;
    private eventListeners;
    constructor(domStorage: DOMStorage);
    setStorage(domStorage: DOMStorage): void;
    private domStorageItemsCleared;
    private domStorageItemRemoved;
    private domStorageItemAdded;
    private domStorageItemUpdated;
    private showDOMStorageItems;
    deleteSelectedItem(): void;
    refreshItems(): void;
    deleteAllItems(): void;
    private editingCallback;
    private removeDupes;
    private deleteCallback;
    private showPreview;
    private previewEntry;
}
