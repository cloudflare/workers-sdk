import { RuleTester } from "eslint";
import rule from "../no-vitest-import-expect.mjs";

const ruleTester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-vitest-import-expect", rule, {
	valid: [
		// No expect import from vitest
		{
			code: 'import { test, describe, it } from "vitest";',
		},
		// Import expect from other packages is allowed
		{
			code: 'import { expect } from "chai";',
		},
		{
			code: 'import { expect } from "@jest/globals";',
		},
		// Default import from vitest is allowed
		{
			code: 'import vitest from "vitest";',
		},
		// Namespace import from vitest is allowed
		{
			code: 'import * as vitest from "vitest";',
		},
		// Other named imports from vitest are allowed
		{
			code: 'import { vi, describe, it, test, beforeEach, afterEach } from "vitest";',
		},
	],

	invalid: [
		// Direct expect import from vitest
		{
			code: 'import { expect } from "vitest";',
			errors: [
				{
					messageId: "noVitestImportExpect",
				},
			],
		},
		// expect with other imports from vitest
		{
			code: 'import { expect, test, describe } from "vitest";',
			errors: [
				{
					messageId: "noVitestImportExpect",
				},
			],
		},
		// expect at end of import list
		{
			code: 'import { test, describe, it, expect } from "vitest";',
			errors: [
				{
					messageId: "noVitestImportExpect",
				},
			],
		},
		// Aliased expect import
		{
			code: 'import { expect as exp } from "vitest";',
			errors: [
				{
					messageId: "noVitestImportExpect",
				},
			],
		},
		// expect with many other imports
		{
			code: 'import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";',
			errors: [
				{
					messageId: "noVitestImportExpect",
				},
			],
		},
	],
});

console.log("✅ All tests passed!");
