export declare class ValueChangedEvent extends Event {
    static readonly eventName = "valuechanged";
    data: {
        value: string;
    };
    constructor(value: string);
}
