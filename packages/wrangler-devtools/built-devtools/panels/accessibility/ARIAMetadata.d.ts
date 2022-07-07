export interface AttributeConfig {
    name: string;
    type: string;
    enum?: string[];
}
export interface RoleConfig {
    name: string;
}
export interface Config {
    attributes: AttributeConfig[];
    roles: RoleConfig[];
}
export declare class ARIAMetadata {
    private readonly attributes;
    private roleNames;
    constructor(config: Config | null);
    private initialize;
    valuesForProperty(property: string): string[];
}
export declare function ariaMetadata(): ARIAMetadata;
export declare class Attribute {
    private readonly enum;
    constructor(config: AttributeConfig);
    getEnum(): string[];
}
