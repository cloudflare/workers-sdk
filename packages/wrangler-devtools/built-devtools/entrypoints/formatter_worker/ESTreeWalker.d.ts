import type * as Acorn from '../../third_party/acorn/acorn.js';
export declare class ESTreeWalker {
    #private;
    constructor(beforeVisit: (arg0: Acorn.ESTree.Node) => (Object | undefined), afterVisit?: ((arg0: Acorn.ESTree.Node) => void));
    static get SkipSubtree(): Object;
    setWalkNulls(value: boolean): void;
    walk(ast: Acorn.ESTree.Node): void;
}
