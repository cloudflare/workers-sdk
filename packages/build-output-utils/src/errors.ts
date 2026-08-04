const BUILD_OUTPUT_ERROR_PREFIX = "Build Output Specification: ";

/**
 * Thrown when the Build Output Specification tree is missing, malformed, or
 * fails schema validation while being read.
 */
export class BuildOutputError extends Error {
	constructor(message: string) {
		super(`${BUILD_OUTPUT_ERROR_PREFIX}${message}`);
		this.name = "BuildOutputError";
	}
}
