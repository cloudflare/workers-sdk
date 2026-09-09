import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { guessWorkerFormat } from "../deployment-bundle/guess-worker-format";
import { mockConsoleMethods } from "./helpers/mock-console";
describe("guess worker format", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	it('should detect a "modules" worker', async ({ expect }) => {
		await writeFile("./index.ts", "export default {};");
		// Note that this isn't actually a valid worker, because it's missing
		// a fetch handler. Regardless, our heuristic is simply to check for exports.
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("modules");
	});

	it('should detect a "service-worker" worker', async ({ expect }) => {
		await writeFile("./index.ts", "");
		// Note that this isn't actually a valid worker, because it's missing
		// a fetch listener. Regardless, our heuristic is simply to check for
		// the lack of exports.
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("service-worker");
	});

	it('should detect a "service-worker" worker using `typeof module`', async ({
		expect,
	}) => {
		await writeFile("./index.ts", "typeof module");
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("service-worker");
	});

	it('should detect a "service-worker" worker using imports', async ({
		expect,
	}) => {
		await writeFile(
			"./dep.ts",
			`
			const value = 'thing';
			export default value;
			`
		);
		await writeFile(
			"./index.ts",
			`
			import value from './dep.ts';
			addEventListener('fetch', (event) => {
				event.respondWith(new Response(value));
			});
			`
		);
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("service-worker");
	});

	it("should not error if a .js entry point has jsx", async ({ expect }) => {
		await writeFile("./index.js", "console.log(<div/>)");
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.js"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("service-worker");
	});

	it.for([
		{
			name: "global scope",
			source: `addEventListener("fetch", (event) => {
				event.respondWith(new Response(foo.toString()));
			});`,
		},
		{
			name: "globalThis",
			source: `globalThis.addEventListener("fetch", (event) => {
				event.respondWith(new Response(foo.toString()));
			});`,
		},
		{
			name: "self",
			source: `self.addEventListener("fetch", (event) => {
				event.respondWith(new Response(foo.toString()));
			});`,
		},
		{
			name: "static bracket notation",
			source: `self["addEventListener"]("fetch", (event) => {
				event.respondWith(new Response(foo.toString()));
			});`,
		},
		{
			name: "a method alias",
			source: `const register = self.addEventListener;
			register.call(self, "fetch", (event) => {
				event.respondWith(new Response(foo.toString()));
			});`,
		},
	])(
		"detects a legacy Service Worker with a named export using $name",
		async ({ source }, { expect }) => {
			await writeFile(
				"./index.ts",
				`
				export const foo = 1;

				${source}
				`
			);
			const guess = await guessWorkerFormat(
				path.join(process.cwd(), "./index.ts"),
				process.cwd(),
				undefined
			);
			expect(guess.format).toBe("service-worker");
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe entrypoint index.ts has exports like an ES Module, but hasn't defined a default export like a module worker normally would. Building the worker using "service-worker" format...[0m

				"
			`);
		}
	);

	it.for([
		{
			name: "locally shadowed globals",
			source: `
				function registerWithSelf(self: { addEventListener: (...args: unknown[]) => void }) {
					self.addEventListener("fetch", () => {});
				}
				function registerWithGlobalThis(globalThis: { addEventListener: (...args: unknown[]) => void }) {
					globalThis.addEventListener("fetch", () => {});
				}
				registerWithSelf({ addEventListener() {} });
				registerWithGlobalThis({ addEventListener() {} });
			`,
		},
		{
			name: "receiver aliases",
			source: `
				const receiver = self;
				receiver.addEventListener("fetch", (event) => {
					event.respondWith(new Response(foo.toString()));
				});
			`,
		},
	])(
		"chooses a Module Worker with a named export when using $name",
		async ({ source }, { expect }) => {
			await writeFile("./index.ts", `export const foo = 1;\n${source}`);
			const guess = await guessWorkerFormat(
				path.join(process.cwd(), "./index.ts"),
				process.cwd(),
				undefined
			);
			expect(guess.format).toBe("modules");
		}
	);

	it("detects a Module Worker with only a named WorkerEntrypoint", async ({
		expect,
	}) => {
		await writeFile(
			"./index.ts",
			`
			import { WorkerEntrypoint } from "cloudflare:workers";

			export class NamedEntrypoint extends WorkerEntrypoint {
				fetch(): Response {
					return new Response("Hello from the named entrypoint");
				}
			}
			`
		);
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("modules");
		expect(std.warn).not.toContain(
			'Building the worker using "service-worker" format'
		);
	});

	it("detects a Module Worker with only a DurableObject", async ({
		expect,
	}) => {
		await writeFile(
			"./index.ts",
			`
			import { DurableObject } from "cloudflare:workers";

			export class NamedEntrypoint extends DurableObject {
				fetch(): Response {
					return new Response("Hello from the named entrypoint");
				}
			}
			`
		);
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("modules");
		expect(std.warn).not.toContain(
			'Building the worker using "service-worker" format'
		);
	});

	it("detects a Module Worker with only a legacy DurableObject", async ({
		expect,
	}) => {
		await writeFile(
			"./index.ts",
			`
			export class SomeClass {
				constructor(controller, env) {}

				async fetch(request) {
					return new Response("Actor!");
				}
			}
			`
		);
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("modules");
		expect(std.warn).not.toContain(
			'Building the worker using "service-worker" format'
		);
	});

	it("detects Module Worker via default export over named WorkerEntrypoint and addEventListener", async ({
		expect,
	}) => {
		await writeFile(
			"./index.ts",
			`
			import { WorkerEntrypoint } from "cloudflare:workers";

			export default {
				fetch(): Response {
					return new Response("Hello from the default entrypoint");
				},
			};

			export class NamedEntrypoint extends WorkerEntrypoint {
				fetch(): Response {
					return new Response("Hello from the named entrypoint");
				}
			}

			addEventListener("fetch", () => {});
			`
		);
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess).toStrictEqual({
			format: "modules",
			exports: ["NamedEntrypoint", "default"],
		});
		expect(std.warn).not.toContain(
			'Building the worker using "service-worker" format'
		);
	});

	it("detects Service Worker format when a named Object and addEventListener are both present", async ({
		expect,
	}) => {
		await writeFile(
			"./index.ts",
			`
			export const NamedEntrypoint = {
				fetch(): Response {
					return new Response("Hello from the named entrypoint");
				}
			}

			addEventListener("fetch", () => {});
			`
		);
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess).toStrictEqual({
			format: "service-worker",
			exports: ["NamedEntrypoint"],
		});
		expect(std.warn).toContain(
			'Building the worker using "service-worker" format'
		);
	});

	// NOTE: this is very strange behavior, but it is intentional
	// For backwards compatibility, the heuristic must assume SW syntax here,
	// even though the file is guaranteed to fail the actual build later, because SW
	// cannot perform internal imports.
	it("detects Service Worker format when a named Entrypoint and addEventListener are both present", async ({
		expect,
	}) => {
		await writeFile(
			"./index.ts",
			`
			import { WorkerEntrypoint } from "cloudflare:workers";

			export class NamedEntrypoint extends WorkerEntrypoint {
				fetch(): Response {
					return new Response("Hello from the named entrypoint");
				}
			}

			addEventListener("fetch", () => {});
			`
		);
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess).toStrictEqual({
			format: "service-worker",
			exports: ["NamedEntrypoint"],
		});
		expect(std.warn).toContain(
			'Building the worker using "service-worker" format'
		);
	});

	it("should list exports", async ({ expect }) => {
		await writeFile(
			"./index.ts",
			"export default {}; export const Hello ='world'"
		);
		// Note that this isn't actually a valid worker, because it's missing
		// a fetch handler. Regardless, our heuristic is simply to check for exports.
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.ts"),
			process.cwd(),
			undefined
		);
		expect(guess.exports).toStrictEqual(["Hello", "default"]);
	});

	it("should detect a modules worker that uses source phase imports", async ({
		expect,
	}) => {
		await writeFile("./mod.wasm", "");
		await writeFile(
			"./index.js",
			`import source mod from './mod.wasm';
export default { fetch() { return new Response(mod); } };`
		);
		const guess = await guessWorkerFormat(
			path.join(process.cwd(), "./index.js"),
			process.cwd(),
			undefined
		);
		expect(guess.format).toBe("modules");
	});
});
