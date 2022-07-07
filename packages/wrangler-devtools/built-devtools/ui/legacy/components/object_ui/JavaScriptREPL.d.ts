import * as SDK from '../../../../core/sdk/sdk.js';
export declare class JavaScriptREPL {
    static wrapObjectLiteral(code: string): string;
    static preprocessExpression(text: string): string;
    static evaluateAndBuildPreview(text: string, throwOnSideEffect: boolean, replMode: boolean, timeout?: number, allowErrors?: boolean, objectGroup?: string, awaitPromise?: boolean): Promise<{
        preview: DocumentFragment;
        result: SDK.RuntimeModel.EvaluationResult | null;
    }>;
    private static buildEvaluationPreview;
}
export declare function setMaxLengthForEvaluation(value: number): void;
export declare function getMaxLengthForEvaluation(): number;
