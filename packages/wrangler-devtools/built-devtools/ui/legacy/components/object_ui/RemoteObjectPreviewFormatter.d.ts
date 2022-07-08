import * as Protocol from '../../../../generated/protocol.js';
export declare class RemoteObjectPreviewFormatter {
    private static objectPropertyComparator;
    appendObjectPreview(parentElement: DocumentFragment | Element, preview: Protocol.Runtime.ObjectPreview, isEntry: boolean): void;
    private abbreviateFullQualifiedClassName;
    private appendObjectPropertiesPreview;
    private appendArrayPropertiesPreview;
    private appendEntriesPreview;
    private renderDisplayName;
    private renderPropertyPreviewOrAccessor;
    renderPropertyPreview(type: string, subtype?: string, className?: string | null, description?: string): HTMLElement;
}
export declare const createSpansForNodeTitle: (container: Element, nodeTitle: string) => void;
export declare const createSpanForTrustedType: (span: Element, description: string, className: string) => void;
