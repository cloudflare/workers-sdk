/**
 * jscodeshift codemod: migrate from `@cloudflare/vitest-pool-workers` to
 * `@cloudflare/vitest-plugin` (v1).
 *
 * The package was renamed in v1. This rewrites the package specifier in all
 * `import`/`export ... from`/`require()` statements, preserving any subpath
 * (e.g. `/config`, `/types`):
 *
 *   import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
 *   import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
 *
 * Into:
 *
 *   import { cloudflareTest } from "@cloudflare/vitest-plugin";
 *   import { defineWorkersProject } from "@cloudflare/vitest-plugin/config";
 *
 * Usage:
 *   npx jscodeshift -t node_modules/@cloudflare/vitest-plugin/dist/codemods/vitest-pool-workers-to-vitest-plugin.mjs vitest.config.ts
 */

const OLD_NAME = "@cloudflare/vitest-pool-workers";
const NEW_NAME = "@cloudflare/vitest-plugin";

// Minimal jscodeshift types — avoids requiring @types/jscodeshift as a dependency.
interface FileInfo {
	path: string;
	source: string;
}
interface ASTType {
	name: string;
}
interface ASTNode {
	type: string;
}
interface LiteralNode extends ASTNode {
	value: unknown;
}
interface NodePath<T = ASTNode> {
	node: T;
}
interface Collection {
	find(type: ASTType, filter?: Record<string, unknown>): Collection;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jscodeshift Collection.forEach accepts callbacks with narrowed NodePath types
	forEach(callback: (path: NodePath<any>) => void): Collection;
	length: number;
	toSource(): string;
}
interface JSCodeshift {
	(source: string): Collection;
	ImportDeclaration: ASTType;
	ExportNamedDeclaration: ASTType;
	ExportAllDeclaration: ASTType;
	CallExpression: ASTType;
	Literal: { check(node: unknown): node is LiteralNode };
	StringLiteral: { check(node: unknown): node is LiteralNode };
}
interface API {
	jscodeshift: JSCodeshift;
}

function rename(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	if (value === OLD_NAME) {
		return NEW_NAME;
	}
	if (value.startsWith(`${OLD_NAME}/`)) {
		return NEW_NAME + value.slice(OLD_NAME.length);
	}
	return undefined;
}

export default function transform(fileInfo: FileInfo, api: API): string {
	const j = api.jscodeshift;
	const root = j(fileInfo.source);

	// import/export ... from "@cloudflare/vitest-pool-workers[/...]"
	for (const type of [
		j.ImportDeclaration,
		j.ExportNamedDeclaration,
		j.ExportAllDeclaration,
	]) {
		root.find(type).forEach((path: NodePath<{ source?: LiteralNode }>) => {
			const source = path.node.source;
			if (!source) {
				return;
			}
			const next = rename(source.value);
			if (next !== undefined) {
				source.value = next;
			}
		});
	}

	// require("@cloudflare/vitest-pool-workers[/...]")
	root
		.find(j.CallExpression, { callee: { name: "require" } })
		.forEach((path: NodePath<{ arguments: ASTNode[] }>) => {
			const arg = path.node.arguments[0];
			if (arg && (j.Literal.check(arg) || j.StringLiteral.check(arg))) {
				const next = rename(arg.value);
				if (next !== undefined) {
					arg.value = next;
				}
			}
		});

	return root.toSource();
}

// Tell jscodeshift to use the TypeScript parser
export const parser = "ts";
