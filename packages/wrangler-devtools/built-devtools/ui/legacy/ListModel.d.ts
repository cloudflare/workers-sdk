import * as Common from '../../core/common/common.js';
export declare class ListModel<T> extends Common.ObjectWrapper.ObjectWrapper<EventTypes<T>> implements Iterable<T> {
    private items;
    constructor(items?: T[]);
    [Symbol.iterator](): Iterator<T, any, undefined>;
    get length(): number;
    at(index: number): T;
    every(callback: (arg0: T) => boolean): boolean;
    filter(callback: (arg0: T) => boolean): T[];
    find(callback: (arg0: T) => boolean): T | undefined;
    findIndex(callback: (arg0: T) => boolean): number;
    indexOf(value: T, fromIndex?: number): number;
    insert(index: number, value: T): void;
    insertWithComparator(value: T, comparator: (arg0: T, arg1: T) => number): void;
    join(separator?: string): string;
    remove(index: number): T;
    replace(index: number, value: T, keepSelectedIndex?: boolean): T;
    replaceRange(from: number, to: number, items: T[]): T[];
    replaceAll(items: T[]): T[];
    slice(from?: number, to?: number): T[];
    some(callback: (arg0: T) => boolean): boolean;
    private replaced;
}
export declare enum Events {
    ItemsReplaced = "ItemsReplaced"
}
export interface ItemsReplacedEvent<T> {
    index: number;
    removed: T[];
    inserted: number;
    keepSelectedIndex?: boolean;
}
export declare type EventTypes<T> = {
    [Events.ItemsReplaced]: ItemsReplacedEvent<T>;
};
