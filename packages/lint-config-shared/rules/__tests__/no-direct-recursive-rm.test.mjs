import { RuleTester } from "eslint";
import rule from "../no-direct-recursive-rm.mjs";

const ruleTester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-direct-recursive-rm", rule, {
	valid: [
		// Single file removal (no recursive option) — should be allowed
		{
			code: 'import fs from "node:fs"; fs.rmSync("file.txt");',
		},
		{
			code: 'import fs from "node:fs"; fs.rmSync("file.txt", { force: true });',
		},
		{
			code: 'import fs from "node:fs/promises"; await fs.rm("file.txt");',
		},
		{
			code: 'import fs from "node:fs/promises"; await fs.rm("file.txt", { force: true });',
		},
		// Named import without recursive
		{
			code: 'import { rmSync } from "node:fs"; rmSync("file.txt");',
		},
		{
			code: 'import { rm } from "node:fs/promises"; await rm("file.txt", { force: true });',
		},
		// Named import rm from "node:fs" (callback-based) without recursive
		{
			code: 'import { rm } from "node:fs"; rm("file.txt", (err) => {});',
		},
		// Using the correct helpers
		{
			code: 'import { removeDir } from "@cloudflare/workers-utils"; await removeDir("dir");',
		},
		{
			code: 'import { removeDirSync } from "@cloudflare/workers-utils"; removeDirSync("dir");',
		},
		// recursive: false is fine
		{
			code: 'import fs from "node:fs"; fs.rmSync("dir", { recursive: false });',
		},
		// Unrelated function called rm
		{
			code: 'function rm(path, opts) {} rm("dir", { recursive: true });',
		},
		// CommonJS single file removal
		{
			code: 'const fs = require("node:fs"); fs.rmSync("file.txt");',
		},
		{
			code: 'const fs = require("node:fs/promises"); fs.rm("file.txt", { force: true });',
		},
	],

	invalid: [
		// Default import from "node:fs" — fs.rmSync with recursive
		{
			code: 'import fs from "node:fs"; fs.rmSync("dir", { recursive: true, force: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// Namespace import from "node:fs" — fs.rmSync with recursive
		{
			code: 'import * as fs from "node:fs"; fs.rmSync("dir", { recursive: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// Named import from "node:fs" — rmSync with recursive
		{
			code: 'import { rmSync } from "node:fs"; rmSync("dir", { recursive: true, force: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// Default import from "node:fs/promises" — fs.rm with recursive
		{
			code: 'import fs from "node:fs/promises"; await fs.rm("dir", { recursive: true, force: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// Named import from "node:fs/promises" — rm with recursive
		{
			code: 'import { rm } from "node:fs/promises"; await rm("dir", { recursive: true, maxRetries: 10 });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// fs.promises.rm pattern
		{
			code: 'import fs from "node:fs"; fs.promises.rm("dir", { recursive: true, force: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// Without "node:" prefix
		{
			code: 'import fs from "fs"; fs.rmSync("dir", { recursive: true, force: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		{
			code: 'import fs from "fs/promises"; await fs.rm("dir", { force: true, recursive: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// CommonJS require — default
		{
			code: 'const fs = require("node:fs"); fs.rmSync("dir", { recursive: true, force: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// CommonJS require — promises
		{
			code: 'const fs = require("node:fs/promises"); fs.rm("dir", { recursive: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// CommonJS require — fs.promises.rm
		{
			code: 'const fs = require("node:fs"); fs.promises.rm("dir", { recursive: true, force: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// Callback-based fs.rm from "node:fs" with recursive in second arg
		{
			code: 'import fs from "node:fs"; fs.rm("dir", { recursive: true, force: true }, (err) => {});',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// Named import rm from "node:fs" (callback-based) with recursive
		{
			code: 'import { rm } from "node:fs"; rm("dir", { recursive: true, force: true }, (err) => {});',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
		// Named import rm from "node:fs" with recursive (no callback)
		{
			code: 'import { rm } from "node:fs"; rm("dir", { recursive: true, force: true });',
			errors: [{ messageId: "noDirectRecursiveRm" }],
		},
	],
});
