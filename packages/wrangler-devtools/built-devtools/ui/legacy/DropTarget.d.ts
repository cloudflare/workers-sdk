export declare class DropTarget {
    private element;
    private readonly transferTypes;
    private messageText;
    private readonly handleDrop;
    private enabled;
    private dragMaskElement;
    constructor(element: Element, transferTypes: {
        kind: string;
        type: RegExp;
    }[], messageText: string, handleDrop: (arg0: DataTransfer) => void);
    setEnabled(enabled: boolean): void;
    private onDragEnter;
    private hasMatchingType;
    private onDragOver;
    private onDrop;
    private onDragLeave;
    private removeMask;
}
export declare const Type: {
    URI: {
        kind: string;
        type: RegExp;
    };
    Folder: {
        kind: string;
        type: RegExp;
    };
    File: {
        kind: string;
        type: RegExp;
    };
    WebFile: {
        kind: string;
        type: RegExp;
    };
    ImageFile: {
        kind: string;
        type: RegExp;
    };
};
