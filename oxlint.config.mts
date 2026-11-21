import cloudflare from "@cloudflare/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
	...cloudflare,
	options: {
		...cloudflare.options,
		// Temporarily off: the disabled rules below make existing directives for
		// them look unused. Turn back on once those rules are re-enabled.
		reportUnusedDisableDirectives: "off",
	},
	rules: {
		...cloudflare.rules,

		// Rules disabled before adopting @cloudflare/oxlint-config.
		"@typescript-eslint/await-thenable": "off",
		"@typescript-eslint/no-base-to-string": "off",
		"@typescript-eslint/no-duplicate-type-constituents": "off",
		"@typescript-eslint/no-for-in-array": "off",
		"@typescript-eslint/no-misused-spread": "off",
		"@typescript-eslint/no-redundant-type-constituents": "off",
		"@typescript-eslint/restrict-template-expressions": "off",
		"typescript/unbound-method": "off",
		"no-meaningless-void-operator": "off",
		"require-array-sort-compare": "off",
		"unicorn/no-new-array": "off",
		"unicorn/no-thenable": "off",
		"unicorn/no-useless-fallback-in-spread": "off",
		"unicorn/no-useless-spread": "off",
		"vitest/hoisted-apis-on-top": "off",
		"vitest/warn-todo": "off",
		"vitest/no-conditional-tests": "off",

		// Enabled by the `correctness` category before adopting the preset,
		// which turns categories off. Listed explicitly to keep that coverage.
		"import/default": "error",
		"import/namespace": "error",
		"no-caller": "error",
		"no-iterator": "error",
		"no-unassigned-vars": "error",
		"oxc/bad-array-method-on-arguments": "error",
		"oxc/erasing-op": "error",
		"oxc/only-used-in-recursion": "error",
		"react/forward-ref-uses-ref": "error",
		"react/no-did-mount-set-state": "error",
		"react/no-this-in-sfc": "error",
		"react/no-unsafe": "error",
		"react/no-will-update-set-state": "error",
		"typescript/no-implied-eval": "error",
		"typescript/no-this-alias": "error",
		"typescript/no-useless-empty-export": "error",
		"unicorn/no-await-in-promise-methods": "error",
		"unicorn/no-empty-file": "error",
		"unicorn/no-single-promise-in-promise-methods": "error",
		"unicorn/no-unnecessary-await": "error",
		"unicorn/no-useless-length-check": "error",
		"unicorn/prefer-string-starts-ends-with": "error",
		"vitest/consistent-each-for": "error",
		"vitest/expect-expect": "error",
		"vitest/no-conditional-expect": "error",
		"vitest/no-disabled-tests": "error",
		"vitest/no-standalone-expect": "error",
		"vitest/require-local-test-context-for-concurrent-snapshots": "error",
		"vitest/require-to-throw-message": "error",
		"vitest/valid-describe-callback": "error",
		"vitest/valid-expect": "error",
		"vitest/valid-title": "error",

		// Project rules not covered by, or configured differently from, the preset.
		curly: ["error", "all"],
		"typescript/consistent-type-imports": [
			"error",
			{ disallowTypeAnnotations: false },
		],
		"@typescript-eslint/no-namespace": "error",
		"no-shadow": ["error", { allow: ["expect"] }],
		"vitest/no-focused-tests": "error",
		"turbo/no-undeclared-env-vars": "error",
		"workers-sdk/no-unsafe-command-execution": "error",
		"workers-sdk/no-direct-recursive-rm": "error",
		"workers-sdk/require-description-when-disabling": "error",
		"@typescript-eslint/no-deprecated": "error",
		"no-console": "off",

		"no-unused-vars": [
			"error",
			{
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				ignoreRestSiblings: true,
				fix: { imports: "fix" },
			},
		],
		"no-restricted-imports": [
			"error",
			{
				paths: [
					{
						name: "ci-info",
						importNames: [
							"isCI",
							"CLOUDFLARE_PAGES",
							"CLOUDFLARE_WORKERS",
							"isPR",
							"name",
						],
						message:
							'Use default import (`import ci from "ci-info"`) and access properties via `ci.isCI`, `ci.CLOUDFLARE_PAGES`, etc. Named imports cannot be controlled in test mocks.',
					},
					{
						name: "vitest",
						importNames: ["expect"],
						message:
							"Import 'expect' from the test context instead of 'vitest' for concurrency safety. Use: test('name', ({ expect }) => { ... })",
					},
					{
						name: "am-i-vibing",
						message:
							"Use `detectAgent()` from `src/utils/detect-agent` instead.",
					},
				],
			},
		],
	},
	ignorePatterns: [
		...cloudflare.ignorePatterns,
		"**/*.js",
		"**/*.cjs",
		"**/*.mjs",
		"fixtures/**",
	],
	jsPlugins: [
		...cloudflare.jsPlugins,
		"eslint-plugin-turbo",
		{
			name: "workers-sdk",
			specifier: "./packages/lint-config-shared/oxlint-plugin.mjs",
		},
	],
	overrides: [
		...cloudflare.overrides,
		{
			files: ["tools/**/*.{ts,tsx,mts,cts}"],
			rules: {
				"no-const-assign": "error",
				"no-func-assign": "error",
			},
		},
		// The preset relaxes these in tests, but this project enforces them there
		// too.
		{
			files: [
				"**/*.{test,spec,integration,e2e}.{ts,tsx,mts,cts}",
				"**/__tests__/**/*.{ts,tsx,mts,cts}",
			],
			rules: {
				"typescript/no-explicit-any": "error",
				"typescript/no-non-null-assertion": "error",
			},
		},
		// Relax some rules for test & script files
		{
			files: ["packages/vite-plugin-cloudflare/e2e/**"],
			rules: {
				"no-console": "off",
				"no-restricted-globals": "off",
				"workers-sdk/no-unsafe-command-execution": "off",
			},
		},
		// Make sure Wrangler's version checking logic in vite-plugin-cloudflare can run properly
		{
			files: ["packages/vite-plugin-cloudflare/**"],
			rules: {
				"workers-sdk/no-wrangler-named-imports": "error",
			},
		},
		// Temporarily disabled while adopting @cloudflare/oxlint-config because they
		// fail on existing code. Re-enable one rule per commit, with its fixes, or
		// document why it stays off. These come last so that they also win over
		// overrides that enable the same rules.
		{
			files: ["**/*"],
			rules: {
				"@nkzw/no-instanceof": "off",
				"array-callback-return": "off",
				eqeqeq: "off",
				"import/consistent-type-specifier-style": "off",
				"import/export": "off",
				"import/no-namespace": "off",
				"no-empty": "off",
				"no-promise-executor-return": "off",
				"no-useless-assignment": "off",
				"object-shorthand": "off",
				"oxc/approx-constant": "off",
				"oxc/no-accumulating-spread": "off",
				"prefer-arrow-callback": "off",
				"prefer-object-has-own": "off",
				"prefer-promise-reject-errors": "off",
				"preserve-caught-error": "off",
				"quality/no-array-filter-map": "off",
				"quality/no-chained-type-assertions": "off",
				"quality/no-conditional-empty-object-spread": "off",
				"quality/no-known-value-widening": "off",
				"quality/no-object-parameters": "off",
				"quality/no-reduce-accumulator-copy": "off",
				"quality/no-reflect-apply": "off",
				"quality/no-reflect-get": "off",
				"quality/no-unknown-returns": "off",
				"quality/no-unknown-type-aliases": "off",
				"quality/no-unsafe-dictionary-type": "off",
				"react/button-has-type": "off",
				"react/immutability": "off",
				"react/jsx-no-target-blank": "off",
				"react/no-unescaped-entities": "off",
				"react/no-unknown-property": "off",
				"react/preserve-manual-memoization": "off",
				"react/refs": "off",
				"react/rules-of-hooks": "off",
				"react/set-state-in-effect": "off",
				"react/static-components": "off",
				"react/use-memo": "off",
				"typescript/array-type": "off",
				"typescript/no-import-type-side-effects": "off",
				"typescript/no-misused-promises": "off",
				"typescript/no-unnecessary-type-assertion": "off",
				"typescript/no-unsafe-argument": "off",
				"typescript/no-unsafe-assignment": "off",
				"typescript/no-unsafe-call": "off",
				"typescript/no-unsafe-member-access": "off",
				"typescript/no-unsafe-return": "off",
				"typescript/no-unsafe-type-assertion": "off",
				"typescript/only-throw-error": "off",
				"typescript/return-await": "off",
				"typescript/switch-exhaustiveness-check": "off",
				"typescript/use-unknown-in-catch-callback-variable": "off",
				"unicorn/catch-error-name": "off",
				"unicorn/consistent-function-scoping": "off",
				"unicorn/no-abusive-eslint-disable": "off",
				"unicorn/no-array-fill-with-reference-type": "off",
				"unicorn/no-hex-escape": "off",
				"unicorn/no-typeof-undefined": "off",
				"unicorn/no-useless-promise-resolve-reject": "off",
				"unicorn/numeric-separators-style": "off",
				"unicorn/prefer-array-flat-map": "off",
				"unicorn/prefer-array-index-of": "off",
				"unicorn/prefer-array-some": "off",
				"unicorn/prefer-at": "off",
				"unicorn/prefer-dom-node-append": "off",
				"unicorn/prefer-import-meta-properties": "off",
				"unicorn/prefer-native-coercion-functions": "off",
				"unicorn/prefer-number-properties": "off",
				"unicorn/prefer-set-has": "off",
				"unicorn/prefer-single-call": "off",
				"unicorn/prefer-string-raw": "off",
				"unicorn/prefer-string-replace-all": "off",
				"unicorn/prefer-string-slice": "off",
				"unicorn/prefer-structured-clone": "off",
				"unicorn/prefer-top-level-await": "off",
				"unicorn/text-encoding-identifier-case": "off",
			},
		},
		// Temporarily disabled only where rules that were already enforced report new
		// findings after upgrading Oxlint and moving to the tsrs type checker.
		{
			files: [
				"packages/vite-plugin-cloudflare/playground/**/vite.config*.ts",
				"packages/vite-plugin-cloudflare/src/__tests__/build-app.spec.ts",
				"packages/vite-plugin-cloudflare/src/cloudflare-environment.ts",
			],
			rules: { "typescript/no-deprecated": "off" },
		},
		{
			files: [
				"packages/vite-plugin-cloudflare/playground/config-changes/__tests__/config-changes.spec.ts",
				"packages/vite-plugin-cloudflare/playground/websockets/__tests__/websockets.spec.ts",
				"packages/vite-plugin-cloudflare/src/__tests__/websockets.spec.ts",
			],
			rules: { "vitest/expect-expect": "off" },
		},
		{
			files: ["packages/vite-plugin-cloudflare/e2e/remote-bindings.test.ts"],
			rules: { "vitest/no-disabled-tests": "off" },
		},
		{
			files: ["packages/vite-plugin-cloudflare/e2e/remote-bindings.test.ts"],
			rules: { "vitest/valid-describe-callback": "off" },
		},
	],
});
