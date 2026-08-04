import { describe, it } from "vitest";
import {
	getRoutesValidationErrorMessage,
	isRoutesJSONSpec,
	MAX_FUNCTIONS_ROUTES_RULE_LENGTH,
	MAX_FUNCTIONS_ROUTES_RULES,
	ROUTES_SPEC_VERSION,
	RoutesValidationError,
	validateRoutes,
} from "../index";
import type { RoutesJSONSpec } from "../index";

describe("routes-validation", () => {
	describe("isRoutesJSONSpec", () => {
		it("should return true if the given routes are in a valid RoutesJSONSpec format", ({
			expect,
		}) => {
			const routes = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: [],
				exclude: [],
			};
			const routesWithoutDescription = {
				version: ROUTES_SPEC_VERSION,
				include: [],
				exclude: [],
			};

			expect(isRoutesJSONSpec(routes)).toBeTruthy();
			expect(isRoutesJSONSpec(routesWithoutDescription)).toBeTruthy();
		});

		it("should return false otherwise", ({ expect }) => {
			const routesWithMissingVersion = {
				include: [],
				exclude: [],
			};
			const routesWithIncorrectVersionNumber = {
				version: 1000,
				include: [],
				exclude: [],
			};
			const routesWithIncorrectVersionType = {
				version: "1000",
				include: [],
				exclude: [],
			};
			const routesWithMissingInclude = {
				version: ROUTES_SPEC_VERSION,
				exclude: [],
			};
			const routesWithMissingExclude = {
				version: ROUTES_SPEC_VERSION,
				include: [],
			};
			const routesWithIncorrectIncludeType = {
				version: ROUTES_SPEC_VERSION,
				include: "[]",
				exclude: [],
			};
			const routesWithIncorrectExcludeType = {
				version: ROUTES_SPEC_VERSION,
				include: [],
				exclude: { route: "/hello" },
			};

			expect(isRoutesJSONSpec(null)).toBeFalsy();
			expect(isRoutesJSONSpec({})).toBeFalsy();
			expect(isRoutesJSONSpec([])).toBeFalsy();
			expect(isRoutesJSONSpec(routesWithMissingVersion)).toBeFalsy();
			expect(isRoutesJSONSpec(routesWithIncorrectVersionNumber)).toBeFalsy();
			expect(isRoutesJSONSpec(routesWithIncorrectVersionType)).toBeFalsy();
			expect(isRoutesJSONSpec(routesWithMissingInclude)).toBeFalsy();
			expect(isRoutesJSONSpec(routesWithMissingExclude)).toBeFalsy();
			expect(isRoutesJSONSpec(routesWithIncorrectIncludeType)).toBeFalsy();
			expect(isRoutesJSONSpec(routesWithIncorrectExcludeType)).toBeFalsy();
		});
	});

	describe("validateRoutes", () => {
		const testRoutesPath = "/public";

		/**
		 * Generate unique route rules for testing aggregate limits.
		 *
		 * @param count - Number of rules to generate.
		 * @returns The generated route rules.
		 */
		function generateUniqueRoutingRules(count: number): string[] {
			let counter = 0;
			return Array(count)
				.fill("/abc")
				.map((route) => `${route}${counter++}`);
		}

		/**
		 * Generate a routing rule with the requested number of path characters.
		 *
		 * @param charCount - Number of characters after the leading slash.
		 * @returns The generated routing rule.
		 */
		function generateRoutingRule(charCount: number): string {
			return `/${Array(charCount).fill("a").join("")}`;
		}

		it("should return if the given routes are valid", ({ expect }) => {
			const routes: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: ["/*"],
				exclude: [],
			};
			const routesWithoutDescription: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				include: ["/hello"],
				exclude: [],
			};

			expect(() => validateRoutes(routes, testRoutesPath)).not.toThrow();
			expect(() =>
				validateRoutes(routesWithoutDescription, testRoutesPath)
			).not.toThrow();
		});

		it("should throw an error if the routes are not a valid RoutesJSONSpec object", ({
			expect,
		}) => {
			// @ts-expect-error -- Intentionally testing invalid types
			const routesWithoutVersion: RoutesJSONSpec = {
				include: ["/*"],
				exclude: [],
			};
			// @ts-expect-error -- Intentionally testing invalid types
			const routesWithoutInclude: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				exclude: [],
			};

			expect(() =>
				// wrap the code in a function, otherwise the error will not be caught
				// and the assertion will fail
				validateRoutes(routesWithoutVersion, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithoutVersion, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.INVALID_JSON_SPEC,
					testRoutesPath
				)
			);

			expect(() =>
				validateRoutes(routesWithoutInclude, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithoutInclude, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.INVALID_JSON_SPEC,
					testRoutesPath
				)
			);
		});

		it("should throw an error if there are no include routing rules", ({
			expect,
		}) => {
			const routesWithoutIncludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: [],
				exclude: [],
			};

			expect(() =>
				validateRoutes(routesWithoutIncludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithoutIncludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.NO_INCLUDE_RULES,
					testRoutesPath
				)
			);
		});

		it("should throw an error if there are more than MAX_FUNCTIONS_ROUTES_RULES include and exclude routing rules combined", ({
			expect,
		}) => {
			const routesWithMaxIncludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: generateUniqueRoutingRules(MAX_FUNCTIONS_ROUTES_RULES + 1),
				exclude: [],
			};
			const routesWithMaxExcludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: ["/hello"],
				exclude: generateUniqueRoutingRules(MAX_FUNCTIONS_ROUTES_RULES + 1),
			};
			const routesWithMaxIncludeExcludeRulesCombined: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: generateUniqueRoutingRules(
					Math.floor(MAX_FUNCTIONS_ROUTES_RULES / 2) + 1
				),
				exclude: generateUniqueRoutingRules(
					Math.floor(MAX_FUNCTIONS_ROUTES_RULES / 2)
				),
			};

			expect(() =>
				validateRoutes(routesWithMaxIncludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithMaxIncludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.TOO_MANY_RULES,
					testRoutesPath
				)
			);

			expect(() =>
				validateRoutes(routesWithMaxExcludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithMaxExcludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.TOO_MANY_RULES,
					testRoutesPath
				)
			);

			expect(() =>
				validateRoutes(routesWithMaxIncludeExcludeRulesCombined, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithMaxIncludeExcludeRulesCombined, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.TOO_MANY_RULES,
					testRoutesPath
				)
			);
		});

		it("should throw an error if any include or exclude routing rule is more than MAX_FUNCTIONS_ROUTES_RULE_LENGTH chars long", ({
			expect,
		}) => {
			const routesWithMaxCharLengthIncludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: [generateRoutingRule(MAX_FUNCTIONS_ROUTES_RULE_LENGTH + 1)],
				exclude: [],
			};
			const routesWithMaxCharLengthExcludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: ["/*"],
				exclude: [generateRoutingRule(MAX_FUNCTIONS_ROUTES_RULE_LENGTH + 1)],
			};
			const routesWithMaxCharLengthRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: [generateRoutingRule(MAX_FUNCTIONS_ROUTES_RULE_LENGTH + 1)],
				exclude: [generateRoutingRule(MAX_FUNCTIONS_ROUTES_RULE_LENGTH + 1)],
			};

			expect(() =>
				validateRoutes(routesWithMaxCharLengthIncludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithMaxCharLengthIncludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.RULE_TOO_LONG,
					testRoutesPath
				)
			);

			expect(() =>
				validateRoutes(routesWithMaxCharLengthExcludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithMaxCharLengthExcludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.RULE_TOO_LONG,
					testRoutesPath
				)
			);

			expect(() =>
				validateRoutes(routesWithMaxCharLengthRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithMaxCharLengthRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.RULE_TOO_LONG,
					testRoutesPath
				)
			);
		});

		it("should throw an error if any include or exclude routing rule does not start with a `/`", ({
			expect,
		}) => {
			const routesWithInvalidIncludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: ["hello"],
				exclude: [],
			};
			const routesWithInvalidExcludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: ["/*"],
				exclude: ["hello"],
			};
			const routesWithInvalidRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				description: "Test routes Object",
				include: ["hello"],
				exclude: ["goodbye"],
			};

			expect(() =>
				validateRoutes(routesWithInvalidIncludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithInvalidIncludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.INVALID_RULES,
					testRoutesPath
				)
			);

			expect(() =>
				validateRoutes(routesWithInvalidExcludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithInvalidExcludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.INVALID_RULES,
					testRoutesPath
				)
			);

			expect(() =>
				validateRoutes(routesWithInvalidRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithInvalidRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.INVALID_RULES,
					testRoutesPath
				)
			);
		});

		it("should throw an error if there are overlapping include rules or overlapping exclude rules", ({
			expect,
		}) => {
			const routesWithOverlappingIncludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				include: [
					"/greeting/hello",
					"/api/time",
					"/date",
					"/greeting/*",
					"/greeting/goodbye",
					"/api/*",
				],
				exclude: [],
			};
			const routesWithOverlappingExcludeRules: RoutesJSONSpec = {
				version: ROUTES_SPEC_VERSION,
				include: ["/hello"],
				exclude: [
					"/greeting/hello",
					"/api/time",
					"/date",
					"/*",
					"/greeting/*",
					"/greeting/goodbye",
					"/api/*",
				],
			};

			expect(() =>
				validateRoutes(routesWithOverlappingIncludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithOverlappingIncludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.OVERLAPPING_RULES,
					testRoutesPath
				)
			);

			expect(() =>
				validateRoutes(routesWithOverlappingExcludeRules, testRoutesPath)
			).toThrow(Error);
			expect(() =>
				validateRoutes(routesWithOverlappingExcludeRules, testRoutesPath)
			).toThrow(
				getRoutesValidationErrorMessage(
					RoutesValidationError.OVERLAPPING_RULES,
					testRoutesPath
				)
			);
		});
	});
});
