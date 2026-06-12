import { errorResponse } from "./errors.worker";
import type { S3Context } from "./common.worker";

const notImplementedHeader = (name: string, value: string) =>
	errorResponse(
		501,
		"NotImplemented",
		`Header '${name}' with value '${value}' not implemented`
	);

export interface ScreeningRules {
	/** Headers rejected with the templated NotImplemented error */
	unsupportedHeaders: string[];
}

export function screenHeaders(
	c: S3Context,
	rules: ScreeningRules
): Response | undefined {
	// Reject session tokens on every operation (auth-level, not
	// operation-level)
	if (c.req.header("x-amz-security-token") !== undefined) {
		return errorResponse(400, "InvalidArgument", "X-Amz-Security-Token");
	}

	for (const name of rules.unsupportedHeaders) {
		const value = c.req.header(name);
		if (value !== undefined) {
			return notImplementedHeader(name, value);
		}
	}

	return undefined;
}
