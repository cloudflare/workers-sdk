export const NativeFunctions: ({
    name: string;
    signatures: string[][];
    receivers?: undefined;
} | {
    name: string;
    signatures: string[][];
    receivers: string[];
})[];
