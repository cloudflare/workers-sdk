import unjs from "eslint-config-unjs";

// https://github.com/unjs/eslint-config
export default unjs(
	{
		ignores: ["runtime/**"],
		rules: {
			"@typescript-eslint/no-unused-vars": 0,
			"unicorn/no-null": 0,
			"unicorn/prefer-math-trunc": 0,
			"unicorn/prefer-code-point": 0,
			"unicorn/text-encoding-identifier-case": 0,
			"prefer-rest-params": 0,
			"prefer-spread": 0,
			"unicorn/prefer-event-target": 0,
			"unicorn/prefer-ternary": 0,
			"unicorn/number-literal-case": 0,
			"generator-star-spacing": 0,
			"unicorn/no-nested-ternary": 0,
			"require-await": 0,
			"unicorn/switch-case-braces": 0,
			"unicorn/prefer-string-replace-all": 0,
			"no-empty": 0,
			"no-func-assign": 0,
			"unicorn/filename-case": 0,
			"@typescript-eslint/no-unused-expressions": 0,
		},
	},
	{
		languageOptions: {
			globals: {
				Deno: "readonly",
			},
		},
	}
);
