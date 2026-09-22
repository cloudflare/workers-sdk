const BUILD_OUTPUT_ERROR_PREFIX = "Build Output Specification: ";

/**
 * Thrown when the Build Output Specification tree is missing, malformed, or
 * internally inconsistent.
 */
export class BuildOutputError extends Error {
	constructor(message: string) {
		super(`${BUILD_OUTPUT_ERROR_PREFIX}${message}`);
		this.name = "BuildOutputError";
	}
}
