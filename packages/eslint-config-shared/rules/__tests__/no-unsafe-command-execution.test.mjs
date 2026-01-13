import { RuleTester } from "eslint";
import rule from "../no-unsafe-command-execution.mjs";

const ruleTester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-unsafe-command-execution", rule, {
	valid: [
		// Static strings are safe
		{
			code: 'const { execSync } = require("child_process"); execSync("ls -la");',
		},
		{
			code: 'require("child_process").execSync("git status");',
		},
		// execFileSync with argument array is safe
		{
			code: 'const { execFileSync } = require("child_process"); execFileSync("git", ["show", "-s", commitHash]);',
		},
		// spawn with argument array and no shell is safe
		{
			code: 'const { spawn } = require("child_process"); spawn("git", ["status"]);',
		},
		// Template literals without expressions are safe
		{
			code: 'const { execSync } = require("child_process"); execSync(`ls -la`);',
		},
		// Non-child_process functions are ignored
		{
			code: "const result = exec(`command ${variable}`);",
		},
		// node:child_process also works
		{
			code: 'const { execSync } = require("node:child_process"); execSync("ls");',
		},
		// ES module imports are safe with static strings
		{
			code: 'import { execSync } from "node:child_process"; execSync("git status");',
		},
		{
			code: 'import { execFileSync } from "node:child_process"; execFileSync("git", ["show", commitHash]);',
		},
	],

	invalid: [
		// Template literal with expression in execSync
		{
			code: 'const { execSync } = require("child_process"); execSync(`git show ${commitHash}`);',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// String concatenation in execSync
		{
			code: 'const { execSync } = require("child_process"); execSync("git show " + commitHash);',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// Direct require pattern
		{
			code: 'require("child_process").execSync(`command ${variable}`);',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// exec (not execSync)
		{
			code: 'const { exec } = require("child_process"); exec(`ls ${dir}`);',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// spawn with shell: true and template literal
		{
			code: 'const { spawn } = require("child_process"); spawn(`ls ${dir}`, [], { shell: true });',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// execFile with template literal
		{
			code: 'const { execFile } = require("child_process"); execFile(`command ${arg}`);',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// node:child_process variant
		{
			code: 'const { execSync } = require("node:child_process"); execSync(`git ${command}`);',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// ES module import with template literal
		{
			code: 'import { execSync } from "node:child_process"; execSync(`git show ${commitHash}`);',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// ES module import with string concatenation
		{
			code: 'import { execSync } from "node:child_process"; execSync("git show " + commitHash);',
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
		// The actual vulnerability we found
		{
			code: `
const { execSync } = require("child_process");
if (!commitMessage) {
	commitMessage = execSync(\`git show -s --format=%B \${commitHash}\`)
		.toString()
		.trim();
}`,
			errors: [
				{
					messageId: "unsafeCommandExecution",
				},
			],
		},
	],
});

console.log("✅ All tests passed!");
