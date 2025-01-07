import type { RawConfig } from "./config";
import type { Diagnostics } from "./diagnostics";
import type { Environment, RawEnvironment } from "./environment";
/**
 *  Mark a field as deprecated.
 *
 * This function will add a diagnostics warning if the deprecated field is found in the `rawEnv` (or an error if it's also a breaking deprecation)
 * The `fieldPath` is a dot separated property path, e.g. `"build.upload.format"`.
 */
export declare function deprecated<T extends object>(diagnostics: Diagnostics, config: T, fieldPath: DeepKeyOf<T>, message: string, remove: boolean, title?: string, type?: "warning" | "error"): void;
/**
 *  Mark a field as experimental.
 *
 * This function will add a diagnostics warning if the experimental field is found in the `rawEnv`.
 * The `fieldPath` is a dot separated property path, e.g. `"build.upload.format"`.
 */
export declare function experimental<T extends object>(diagnostics: Diagnostics, config: T, fieldPath: DeepKeyOf<T>): void;
/**
 * Get an inheritable environment field, after computing and validating its value.
 *
 * If the field is not defined in the given environment, then fallback to the value from the top-level config,
 * and then the `defaultValue`.
 */
export declare function inheritable<K extends keyof Environment>(diagnostics: Diagnostics, topLevelEnv: Environment | undefined, rawEnv: RawEnvironment, field: K, validate: ValidatorFn, defaultValue: Environment[K], transformFn?: TransformFn<Environment[K]>): Environment[K];
/**
 * Get an inheritable environment field, but only if we are in legacy environments
 */
export declare function inheritableInLegacyEnvironments<K extends keyof Environment>(diagnostics: Diagnostics, isLegacyEnv: boolean | undefined, topLevelEnv: Environment | undefined, rawEnv: RawEnvironment, field: K, validate: ValidatorFn, transformFn: TransformFn<Environment[K]> | undefined, defaultValue: Environment[K]): Environment[K];
/**
 * Type of function that is used to transform an inheritable environment field.
 */
type TransformFn<T> = (fieldValue: T | undefined) => T | undefined;
/**
 * Transform an environment field by appending current environment name to it.
 */
export declare const appendEnvName: (envName: string) => TransformFn<string | undefined>;
/**
 * Get a not inheritable environment field, after computing and validating its value.
 *
 * If the field is not defined in the given environment but it is defined in the top-level config,
 * then log a warning and return the `defaultValue`.
 */
export declare function notInheritable<K extends keyof Environment>(diagnostics: Diagnostics, topLevelEnv: Environment | undefined, rawConfig: RawConfig | undefined, rawEnv: RawEnvironment, envName: string, field: K, validate: ValidatorFn, defaultValue: Environment[K]): Environment[K];
type DeepKeyOf<T> = (T extends object ? {
    [K in Exclude<keyof T, symbol>]: `${K}${DotPrefix<DeepKeyOf<T[K]>>}`;
}[Exclude<keyof T, symbol>] : "") extends infer D ? Extract<D, string> : never;
type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;
/**
 * The type of a function that can be used to validate a configuration field.
 */
export type ValidatorFn = (diagnostics: Diagnostics, field: string, value: unknown, topLevelEnv: Environment | undefined) => boolean;
/**
 * Validate that the field is a string.
 */
export declare const isString: ValidatorFn;
/**
 * Validate that the `name` field is compliant with EWC constraints.
 */
export declare const isValidName: ValidatorFn;
/**
 * Validate that the field is a valid ISO-8601 date time string
 * see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format
 * or https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date-time-string-format
 */
export declare const isValidDateTimeStringFormat: (diagnostics: Diagnostics, field: string, value: string) => boolean;
/**
 * Validate that the field is an array of strings.
 */
export declare const isStringArray: ValidatorFn;
/**
 * Validate that the field is an object containing the given properties.
 */
export declare const isObjectWith: (...properties: string[]) => ValidatorFn;
/**
 * Validate that the field value is one of the given choices.
 */
export declare const isOneOf: (...choices: unknown[]) => ValidatorFn;
/**
 * Aggregate multiple validator functions
 */
export declare const all: (...validations: ValidatorFn[]) => ValidatorFn;
/**
 * Check that the field is mutually exclusive with a list of other fields.
 *
 * @param container the container of the fields to check against.
 * @param fields the names of the fields to check against.
 */
export declare const isMutuallyExclusiveWith: <T extends RawEnvironment | RawConfig>(container: T, ...fields: (keyof T)[]) => ValidatorFn;
/**
 * Validate that the field is a boolean.
 */
export declare const isBoolean: ValidatorFn;
/**
 * Validate that the required field exists and has the expected type.
 */
export declare const validateRequiredProperty: (diagnostics: Diagnostics, container: string, key: string, value: unknown, type: TypeofType, choices?: unknown[]) => boolean;
/**
 * Validate that at least one of the properties in the list is required.
 */
export declare const validateAtLeastOnePropertyRequired: (diagnostics: Diagnostics, container: string, properties: {
    key: string;
    value: unknown;
    type: TypeofType;
}[]) => boolean;
/**
 * Validate that, if the optional field exists, then it has the expected type.
 */
export declare const validateOptionalProperty: (diagnostics: Diagnostics, container: string, key: string, value: unknown, type: TypeofType, choices?: unknown[]) => boolean;
/**
 * Validate that the field is an array of elements of the given type.
 */
export declare const validateTypedArray: (diagnostics: Diagnostics, container: string, value: unknown, type: TypeofType) => boolean;
/**
 * Validate that, if the optional field exists, it is an array of elements of the given type.
 */
export declare const validateOptionalTypedArray: (diagnostics: Diagnostics, container: string, value: unknown, type: TypeofType) => boolean;
/**
 * Test to see if `obj` has the required property `prop` of type `type`.
 */
export declare const isRequiredProperty: <T extends object>(obj: object, prop: keyof T, type: TypeofType, choices?: unknown[]) => obj is T;
/**
 * Test to see if `obj` has the optional property `prop` of type `type`.
 */
export declare const isOptionalProperty: <T extends object>(obj: object, prop: keyof T, type: TypeofType) => obj is T;
/**
 * Test to see if `obj` has the property `prop`.
 */
export declare const hasProperty: <T extends object>(obj: object, property: keyof T) => obj is T;
/**
 * Add warning messages about any properties in the given field that are not expected to be there.
 */
export declare const validateAdditionalProperties: (diagnostics: Diagnostics, fieldPath: string, restProps: Iterable<string>, knownProps: Iterable<string>) => boolean;
/**
 * Get the names of the bindings collection in `value`.
 *
 * Will return an empty array if it doesn't understand the value
 * passed in, so another form of validation should be
 * performed externally.
 */
export declare const getBindingNames: (value: unknown) => string[];
/**
 * JavaScript `typeof` operator return values.
 */
export type TypeofType = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";
export {};
