import type { Config, RawConfig } from "./config";
import type { Diagnostics } from "./diagnostics";
import type { Environment, RawEnvironment } from "./environment";

/**
 *  Mark a field as deprecated.
 *
 * This function will add a diagnostics warning if the deprecated field is found in the `rawEnv` (or an error if it's also a breaking deprecation)
 * The `fieldPath` is a dot separated property path, e.g. `"build.upload.format"`.
 */
export function deprecated<T extends object>(
  diagnostics: Diagnostics,
  config: T,
  fieldPath: DeepKeyOf<T>,
  message: string,
  remove: boolean,
  breaking = false
): void {
  const result = unwindPropertyPath(config, fieldPath);
  if (result !== undefined && result.field in result.container) {
    (breaking ? diagnostics.errors : diagnostics.warnings).push(
      `DEPRECATION: "${fieldPath}":\n${message}`
    );
    if (remove) {
      delete (result.container as Record<string, unknown>)[result.field];
    }
  }
}

/**
 *  Mark a field as experimental.
 *
 * This function will add a diagnostics warning if the experimental field is found in the `rawEnv`.
 * The `fieldPath` is a dot separated property path, e.g. `"build.upload.format"`.
 */
export function experimental<T extends object>(
  diagnostics: Diagnostics,
  config: T,
  fieldPath: DeepKeyOf<T>
): void {
  const result = unwindPropertyPath(config, fieldPath);
  if (result !== undefined && result.field in result.container) {
    diagnostics.warnings.push(
      `"${fieldPath}" fields are experimental and may change or break at any time.`
    );
  }
}

/**
 * Get an inheritable environment field, after computing and validating its value.
 *
 * If the field is not defined in the given environment, then fallback to the value from the top-level config,
 * and then the `defaultValue`.
 */
export function inheritable<K extends keyof Environment>(
  diagnostics: Diagnostics,
  config: Config | undefined,
  rawEnv: RawEnvironment,
  field: K,
  validate: ValidatorFn,
  defaultValue: Environment[K]
): Environment[K] {
  validate(diagnostics, field, rawEnv[field], config);
  return (rawEnv[field] as Environment[K]) ?? config?.[field] ?? defaultValue;
}

/**
 * Get a not inheritable environment field, after computing and validating its value.
 *
 * If the field is not defined in the given environment but it is defined in the top-level config,
 * then log a warning and return the `defaultValue`.
 */
export function notInheritable<K extends keyof Environment>(
  diagnostics: Diagnostics,
  config: Config | undefined,
  rawConfig: RawConfig | undefined,
  rawEnv: RawEnvironment,
  envName: string,
  field: K,
  validate: ValidatorFn,
  defaultValue: Environment[K]
): Environment[K] {
  if (rawEnv[field] !== undefined) {
    validate(diagnostics, field, rawEnv[field], config);
  } else {
    if (rawConfig?.[field] !== undefined) {
      diagnostics.warnings.push(
        `"${field}" exists at the top level, but not on "env.${envName}".\n` +
          `This is not what you probably want, since "${field}" is not inherited by environments.\n` +
          `Please add "${field}" to "env.${envName}".`
      );
    }
  }
  return (rawEnv[field] as Environment[K]) ?? defaultValue;
}

// Idea taken from https://stackoverflow.com/a/66661477
type DeepKeyOf<T> = (
  T extends object
    ? {
        [K in Exclude<keyof T, symbol>]: `${K}${DotPrefix<DeepKeyOf<T[K]>>}`;
      }[Exclude<keyof T, symbol>]
    : ""
) extends infer D
  ? Extract<D, string>
  : never;

type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;

/**
 * Return a container object and field name for the last property in a given property path.
 *
 * For example, given a path of `"build.upload.format"`) and a starting `root` object
 * this will return:
 *
 * ```
 * { container: root.build.upload, field: "format" }
 * ```
 */
function unwindPropertyPath<T extends object>(
  root: T,
  path: DeepKeyOf<T>
): { container: object; field: string } | undefined {
  let container: object = root;
  const parts = (path as string).split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (!hasProperty(container, parts[i])) {
      return;
    }
    container = container[parts[i]];
  }
  return { container, field: parts[parts.length - 1] };
}

/**
 * The type of a function that can be used to validate a configuration field.
 */
export type ValidatorFn = (
  diagnostics: Diagnostics,
  field: string,
  value: unknown,
  config: Config | undefined
) => boolean;

/**
 * Validate that the field is a string.
 */
export const isString: ValidatorFn = (diagnostics, field, value) => {
  if (value !== undefined && typeof value !== "string") {
    diagnostics.errors.push(
      `Expected "${field}" field to be a string but got ${JSON.stringify(
        value
      )}.`
    );
    return false;
  }
  return true;
};

/**
 * Validate that the field is an array of strings.
 */
export const isStringArray: ValidatorFn = (diagnostics, field, value) => {
  if (
    value !== undefined &&
    (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
  ) {
    diagnostics.errors.push(
      `Expected "${field}" field to be an array of strings but got ${JSON.stringify(
        value
      )}.`
    );
    return false;
  }
  return true;
};

/**
 * Validate that the field is an object containing the given properties.
 */
export const isObjectWith =
  (...properties: string[]): ValidatorFn =>
  (diagnostics, field, value) => {
    if (
      value !== undefined &&
      (typeof value !== "object" ||
        value === null ||
        !properties.every((prop) => prop in value))
    ) {
      diagnostics.errors.push(
        `Expected "${field}" field to be an object containing properties ${properties} but got ${JSON.stringify(
          value
        )}.`
      );
      return false;
    }
    return true;
  };

/**
 * Validate that the field value is one of the given choices.
 */
export const isOneOf =
  (...choices: unknown[]): ValidatorFn =>
  (diagnostics, field, value) => {
    if (value !== undefined && !choices.some((choice) => value === choice)) {
      diagnostics.errors.push(
        `Expected "${field}" field to be on of ${choices} but got ${JSON.stringify(
          value
        )}.`
      );
      return false;
    }
    return true;
  };

/**
 * Validate that the field is a boolean.
 */
export const isBoolean: ValidatorFn = (diagnostics, field, value) => {
  if (value !== undefined && typeof value !== "boolean") {
    diagnostics.errors.push(
      `Expected "${field}" field to be a boolean but got ${JSON.stringify(
        value
      )}.`
    );
    return false;
  }
  return true;
};

/**
 * Validate that the required field exists and has the expected type.
 */
export const validateRequiredProperty = (
  diagnostics: Diagnostics,
  container: string,
  key: string,
  value: unknown,
  type: string
): boolean => {
  if (container) {
    container += ".";
  }
  if (value === undefined) {
    diagnostics.errors.push(`ERROR: "${container}${key}" is a required field.`);
    return false;
  } else if (typeof value !== type) {
    diagnostics.errors.push(
      `ERROR: "${container}${key}" should be of type ${type} but got ${JSON.stringify(
        value
      )}.`
    );
    return false;
  }
  return true;
};

/**
 * Validate that, if the optional field exists, then it has the expected type.
 */
export const validateOptionalProperty = (
  diagnostics: Diagnostics,
  container: string,
  key: string,
  value: unknown,
  type: string
): boolean => {
  if (value !== undefined) {
    return validateRequiredProperty(diagnostics, container, key, value, type);
  }
  return true;
};

/**
 * Validate that the field is an array of elements of the given type.
 */
export const validateTypedArray = (
  diagnostics: Diagnostics,
  container: string,
  value: unknown,
  type: string
): boolean => {
  let isValid = true;
  if (!Array.isArray(value)) {
    diagnostics.errors.push(
      `"${container}" should be an array of ${type}s but got ${JSON.stringify(
        value
      )}`
    );
    isValid = false;
  } else {
    for (let i = 0; i < value.length; i++) {
      isValid =
        validateRequiredProperty(
          diagnostics,
          container,
          `[${i}]`,
          value[i],
          type
        ) && isValid;
    }
  }
  return isValid;
};

/**
 * Validate that, if the optional field exists, it is an array of elements of the given type.
 */
export const validateOptionalTypedArray = (
  diagnostics: Diagnostics,
  container: string,
  value: unknown,
  type: string
) => {
  if (value !== undefined) {
    return validateTypedArray(diagnostics, container, value, type);
  }
  return true;
};

/**
 * Test to see if `obj` has the required property `prop` of type `type`.
 */
export const isRequiredProperty = <T extends object>(
  obj: object,
  prop: keyof T,
  type: string,
  choices?: unknown[]
): obj is T =>
  hasProperty<T>(obj, prop) &&
  typeof obj[prop] === type &&
  (choices === undefined || choices.includes(obj[prop]));

/**
 * Test to see if `obj` has the optional property `prop` of type `type`.
 */
export const isOptionalProperty = <T extends object>(
  obj: object,
  prop: keyof T,
  type: string
): obj is T => !hasProperty<T>(obj, prop) || typeof obj[prop] === type;

/**
 * Test to see if `obj` has the property `prop`.
 */
export const hasProperty = <T extends object>(
  obj: object,
  property: keyof T
): obj is T => property in obj;

/**
 * Add warning messages about any properties in the given field that are not expected to be there.
 */
export const validateAdditionalProperties = (
  diagnostics: Diagnostics,
  fieldPath: string,
  restProps: Iterable<string>,
  knownProps: Iterable<string>
): boolean => {
  const restPropSet = new Set(restProps);
  for (const knownProp of knownProps) {
    restPropSet.delete(knownProp);
  }
  if (restPropSet.size > 0) {
    const fields = Array.from(restPropSet.keys()).map((field) => `"${field}"`);
    diagnostics.warnings.push(
      `Unexpected fields found in ${fieldPath} field: ${fields}`
    );
    return false;
  }
  return true;
};
