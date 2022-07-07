import type { DOMNode } from './Helper.js';
export declare type UserScrollPosition = 'start' | 'middle' | 'end';
export interface Crumb {
    title: CrumbTitle;
    selected: boolean;
    node: DOMNode;
    originalNode: unknown;
}
export interface CrumbTitle {
    main: string;
    extras: {
        id?: string;
        classes?: string[];
    };
}
export declare const crumbsToRender: (crumbs: readonly DOMNode[], selectedNode: Readonly<DOMNode> | null) => Crumb[];
export declare const determineElementTitle: (domNode: DOMNode) => CrumbTitle;
