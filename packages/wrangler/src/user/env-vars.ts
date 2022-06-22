import { getEnvironmentVariableFactory } from "../environment-variables";

/**
 * Try to read the API token from the environment.
 */
export const getCloudflareAPITokenFromEnv = getEnvironmentVariableFactory({
  variableName: "CLOUDFLARE_API_TOKEN",
  deprecatedName: "CF_API_TOKEN",
});

/**
 * Try to read the account ID from the environment.
 */
export const getCloudflareAccountIdFromEnv = getEnvironmentVariableFactory({
  variableName: "CLOUDFLARE_ACCOUNT_ID",
  deprecatedName: "CF_ACCOUNT_ID",
});
