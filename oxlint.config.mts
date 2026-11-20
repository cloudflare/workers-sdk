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
		"vitest/require-local-test-context-for-concurrent-snapshots": "error",

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
		// Only published packages forbid `console`, see the override below.
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
		"packages/create-cloudflare/**/templates/**/*.*",
		"!packages/create-cloudflare/**/templates*/**/c3.ts",
		// TODO: we really should be linting this folder
		"packages/wrangler/templates/**",
		// Ignore generated files
		"packages/containers-shared/src/client/**",
		"packages/local-explorer-ui/src/api/generated/**",
		"packages/local-explorer-ui/src/routeTree.gen.ts",
		"packages/miniflare/src/runtime/config/workerd.*",
		"packages/quick-edit-extension/vscode.d.ts",
		"packages/quick-edit-extension/vscode.proposed.*.d.ts",
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
		// Published packages which all have their own "logger" class that should be used instead.
		{
			files: [
				"packages/cli/**",
				"packages/create-cloudflare/**",
				"packages/miniflare/**",
				"packages/wrangler/**",
				"packages/workers-utils/**",
			],
			rules: {
				"no-console": "error",
			},
		},
		// TODO: remove these overrides. This is a legacy of Miniflare's history, not intentional
		{
			files: ["packages/miniflare/**"],
			rules: {
				"@typescript-eslint/no-explicit-any": "off",
				"@typescript-eslint/ban-ts-comment": "off",
				"@typescript-eslint/no-floating-promises": "off",
				"no-shadow": "off",
				"no-useless-escape": "off",
				"no-unsafe-optional-chaining": "off",
				"no-control-regex": "off",
				"no-case-declarations": "off",
				"turbo/no-undeclared-env-vars": "off",
			},
		},
		{
			files: ["packages/wrangler/src/**", "packages/workers-utils/src/**"],
			rules: {
				"no-restricted-globals": [
					"error",
					{
						name: "__dirname",
						message: "Use `getBasePath()` instead.",
					},
					{
						name: "__filename",
						message: "Use `getBasePath()` instead.",
					},
					{
						name: "fetch",
						message: "Use undici's fetch instead",
					},
				],
			},
		},
		// Although in _general_ Miniflare shouldn't use console.log(), it's Workers can and should
		{
			files: ["packages/miniflare/src/workers/**/*.ts"],
			rules: {
				"no-console": "off",
				"no-restricted-imports": [
					"error",
					{
						paths: [
							{
								name: "zod",
								allowTypeImports: true,
								message: "Import runtime values from `miniflare:zod` instead.",
							},
						],
					},
				],
			},
		},
		{
			files: ["packages/miniflare/src/workers/shared/zod.worker.ts"],
			rules: {
				"no-restricted-imports": "off",
			},
		},
		// Relax some rules for test & script files
		{
			files: [
				"packages/wrangler/src/__tests__/**",
				"packages/wrangler/e2e/**",
				"packages/wrangler/scripts/**",
				"packages/miniflare/scripts/**",
				"packages/cli/src/__tests__/**",
				"packages/create-cloudflare/scripts/**",
				"packages/create-cloudflare/src/__tests__/**",
				"packages/workers-utils/tests/**",
				"packages/vite-plugin-cloudflare/e2e/**",
			],
			rules: {
				"no-console": "off",
				"no-restricted-globals": "off",
				"workers-sdk/no-unsafe-command-execution": "off",
			},
		},
		// Local Explorer UI e2e tests use Playwright helpers (waitForText, waitForTableRows, etc.)
		// as assertions, which the vitest/expect-expect rule doesn't recognise.
		{
			files: ["packages/local-explorer-ui/src/__e2e__/**"],
			rules: {
				"vitest/expect-expect": "off",
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
			files: ["packages/miniflare/src/index.ts"],
			rules: { "no-unused-vars": "off" },
		},
		{
			files: ["packages/wrangler/src/logger.ts"],
			rules: { "prefer-spread": "off" },
		},
		{
			files: [
				"packages/pages-functions/src/__tests__/routes-consolidation.test.ts",
			],
			rules: { "unicorn/prefer-set-size": "off" },
		},
		{
			files: [
				"packages/vite-plugin-cloudflare/playground/node-compat/worker-process/index.ts",
			],
			rules: { "no-global-assign": "off" },
		},
		{
			files: [
				"packages/miniflare/src/cf.ts",
				"packages/unenv-preset/src/runtime/node/process.ts",
				"packages/vite-plugin-cloudflare/playground/**/vite.config*.ts",
				"packages/vite-plugin-cloudflare/src/__tests__/build-app.spec.ts",
				"packages/vite-plugin-cloudflare/src/cloudflare-environment.ts",
				"packages/workers-auth/src/state.ts",
				"packages/workers-editor-shared/vite.config.ts",
				"packages/workers-utils/src/config/validation.ts",
				"packages/workers-utils/src/map-worker-metadata-bindings.ts",
				"packages/workers-utils/tests/config/validation/normalize-and-validate-config.test.ts",
				"packages/workflows-shared/src/lib/rollback.ts",
			],
			rules: { "typescript/no-deprecated": "off" },
		},
	],
});
