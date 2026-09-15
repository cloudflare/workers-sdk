import { FatalError } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import {
	MAX_FUNCTIONS_ROUTES_RULE_LENGTH,
	MAX_FUNCTIONS_ROUTES_RULES,
	ROUTES_SPEC_VERSION,
} from "../../pages/constants";
import {
	getRoutesValidationErrorMessage,
	RoutesValidationError,
	validateRoutes,
} from "../../pages/functions/routes-validation";
import type { RoutesJSONSpec } from "../../pages/functions/routes-transformation";

const testRoutesPath = "/public";

const validationCases: Array<{
	name: string;
	routes: RoutesJSONSpec;
	code: RoutesValidationError;
	telemetryMessage: string;
}> = [
	{
		name: "invalid JSON specs",
		routes: {} as RoutesJSONSpec,
		code: RoutesValidationError.INVALID_JSON_SPEC,
		telemetryMessage: "pages functions routes invalid json spec",
	},
	{
		name: "missing include rules",
		routes: {
			version: ROUTES_SPEC_VERSION,
			include: [],
			exclude: [],
		},
		code: RoutesValidationError.NO_INCLUDE_RULES,
		telemetryMessage: "pages functions routes missing include rules",
	},
	{
		name: "too many rules",
		routes: {
			version: ROUTES_SPEC_VERSION,
			include: Array.from(
				{ length: MAX_FUNCTIONS_ROUTES_RULES + 1 },
				(_, index) => `/route-${index}`
			),
			exclude: [],
		},
		code: RoutesValidationError.TOO_MANY_RULES,
		telemetryMessage: "pages functions routes too many rules",
	},
	{
		name: "rules that are too long",
		routes: {
			version: ROUTES_SPEC_VERSION,
			include: [`/${"a".repeat(MAX_FUNCTIONS_ROUTES_RULE_LENGTH)}`],
			exclude: [],
		},
		code: RoutesValidationError.RULE_TOO_LONG,
		telemetryMessage: "pages functions routes rule too long",
	},
	{
		name: "invalid rules",
		routes: {
			version: ROUTES_SPEC_VERSION,
			include: ["route"],
			exclude: [],
		},
		code: RoutesValidationError.INVALID_RULES,
		telemetryMessage: "pages functions routes invalid rules",
	},
	{
		name: "overlapping rules",
		routes: {
			version: ROUTES_SPEC_VERSION,
			include: ["/api/*", "/api/route"],
			exclude: [],
		},
		code: RoutesValidationError.OVERLAPPING_RULES,
		telemetryMessage: "pages functions routes overlapping rules",
	},
];

describe("routes-validation adapter", () => {
	for (const { name, routes, code, telemetryMessage } of validationCases) {
		it(`converts ${name} to FatalError`, ({ expect }) => {
			let error: unknown;
			try {
				validateRoutes(routes, testRoutesPath);
			} catch (caughtError) {
				error = caughtError;
			}

			expect(error).toBeInstanceOf(FatalError);
			expect(error).toMatchObject({
				message: getRoutesValidationErrorMessage(code, testRoutesPath),
				telemetryMessage,
			});
		});
	}

	it("preserves unexpected validation errors", ({ expect }) => {
		const error = new TypeError("unexpected validation failure");
		const invalidRule = {
			get length(): number {
				throw error;
			},
			match: () => null,
			endsWith: () => false,
		} as unknown as string;

		let caughtError: unknown;
		try {
			validateRoutes(
				{
					version: ROUTES_SPEC_VERSION,
					include: [invalidRule],
					exclude: [],
				},
				testRoutesPath
			);
		} catch (caught) {
			caughtError = caught;
		}

		expect(caughtError).toBe(error);
		expect(caughtError).not.toBeInstanceOf(FatalError);
	});
});
