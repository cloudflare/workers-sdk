import { logger } from "./logger";

/**
 * Create a function used to access an environment variable.
 *
 * This is not memoized to allow us to change the value at runtime, such as in testing.
 * A warning is shown if the client is using a deprecated version - but only once.
 */
export function getEnvironmentVariableFactory({
  variableName,
  deprecatedName,
  defaultValue,
}: {
  variableName: string;
  deprecatedName?: string;
  defaultValue?: string;
}) {
  let hasWarned = false;
  return () => {
    if (process.env[variableName]) {
      return process.env[variableName];
    } else if (deprecatedName && process.env[deprecatedName]) {
      if (!hasWarned) {
        // Only show the warning once.
        hasWarned = true;
        logger.warn(
          `Using "${deprecatedName}" environment variable. This is deprecated. Please use "${variableName}", instead.`
        );
      }
      return process.env[deprecatedName];
    } else {
      return defaultValue;
    }
  };
}
