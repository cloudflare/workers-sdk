import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { guessWorkerFormat } from "../deployment-bundle/guess-worker-format";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

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

	it("logs a warning when a worker has exports, but not a default one", async ({
		expect,
	}) => {
		await writeFile("./index.ts", "export const foo = 1;");
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
});
