export declare class CharacterIdMap<T> {
    #private;
    constructor();
    toChar(object: T): string;
    fromChar(character: string): T | null;
}
