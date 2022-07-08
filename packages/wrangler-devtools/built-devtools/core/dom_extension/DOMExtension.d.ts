export declare function rangeOfWord(rootNode: Node, offset: number, stopCharacters: string, stayWithinNode: Node, direction?: string): Range;
export declare const originalAppendChild: <T extends Node>(node: T) => T;
export declare const originalInsertBefore: <T extends Node>(node: T, child: Node | null) => T;
export declare const originalRemoveChild: <T extends Node>(child: T) => T;
export declare const originalRemoveChildren: () => void;
