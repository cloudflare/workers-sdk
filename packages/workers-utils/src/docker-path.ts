import { getEnvironmentVariableFactory } from "./environment-variables/factory";

/**
 * Returns the configured path to the Docker binary.
 *
 * @returns The value of `WRANGLER_DOCKER_BIN`, or `docker` when unset.
 */
export const getDockerPath = getEnvironmentVariableFactory({
	variableName: "WRANGLER_DOCKER_BIN",
	defaultValue() {
		return "docker";
	},
});
