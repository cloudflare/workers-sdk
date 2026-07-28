/**
 * Thrown when the Build Output Specification tree is missing, malformed, or
 * fails schema validation while being read.
 */
export class BuildOutputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BuildOutputError";
	}
}
