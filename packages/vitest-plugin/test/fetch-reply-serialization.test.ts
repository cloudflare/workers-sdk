import { describe, it } from "vitest";
import { CloudflarePoolWorker } from "../src/pool/cloudflare-pool-worker";
import type { WorkerRequest } from "vitest/node";

// Bypasses the constructor's version check and start(). `send()` only needs a
// socket to write to and parsed pool options to exist, so a fake socket that
// records what it's given is enough to drive the real serialisation path.
function createPoolWorker(sent: string[]): CloudflarePoolWorker {
	const worker = Object.create(
		CloudflarePoolWorker.prototype
	) as CloudflarePoolWorker;
	Object.defineProperty(worker, "moduleFetchRequestIds", {
		value: new Set<string>(),
	});
	Object.defineProperty(worker, "socket", {
		value: { send: (data: string) => sent.push(data) },
	});
	Object.defineProperty(worker, "parsedPoolOptions", { value: {} });
	return worker;
}

// Roughly what Vite's SSR transform hands back for a module: transformed code
// followed by its inline source map, about 31 KB in all.
function transformedModuleCode(index: number): string {
	let code = "";
	for (let i = 0; code.length < 16_000; i++) {
		code += [
			`const __vite_ssr_import_${i}__ = await __vite_ssr_import__("/src/lib/module-${index}-${i}.ts", {"importedNames":["helper${i}"]});`,
			`function handler${i}(request, env) {`,
			`\tif (request.headers.get("content-type") !== "application/json") return new Response("<p>bad</p>", { status: 400 });`,
			`\treturn (0,__vite_ssr_import_${i}__.helper${i})(env, 'value ${i}');`,
			`}\n`,
		].join("\n");
	}
	const map = JSON.stringify({
		version: 3,
		sources: [`/src/routes/module-${index}.ts`],
		mappings: "AAAA,SAASA,QAAQ,CAACC,GAAG,EAAE;".repeat(code.length / 64),
	});
	return `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString("base64")}\n`;
}

// birpc's reply to a module `fetch()` RPC: `t: "s"`, the request ID and the
// `FetchResult` Vite's module runner expects
function fetchReply(index: number): WorkerRequest {
	const id = `/src/routes/module-${index}.ts`;
	return {
		t: "s",
		i: `rpc-${index}`,
		r: {
			code: transformedModuleCode(index),
			file: id,
			id,
			url: id,
			invalidate: false,
		},
	} as unknown as WorkerRequest;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

describe("module fetch reply serialisation", () => {
	it("sends module code without costing much more than JSON-encoding it", ({
		expect,
	}) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/16272
		// Every module a test file imports comes back from Vitest's main thread
		// as a `fetch` reply carrying its whole transformed code and source map,
		// and the pool serialises each one on that single thread before sending
		// it to workerd. Both ends decode with `JSON.parse()` underneath, so the
		// encoding shouldn't cost much more than `JSON.stringify()` of the same
		// reply. Escaping the code one character at a time costs several times
		// that, and dominates the main thread on large suites.
		const replies = Array.from({ length: 40 }, (_, i) => fetchReply(i));
		const totalChars = replies.reduce(
			(total, reply) =>
				total + (reply as unknown as { r: { code: string } }).r.code.length,
			0
		);
		expect(totalChars).toBeGreaterThan(1_000_000);

		const sent: string[] = [];
		const worker = createPoolWorker(sent);
		const sendAll = () => {
			sent.length = 0;
			for (const reply of replies) {
				worker.send(reply);
			}
		};
		const jsonEncodeAll = () => {
			sent.length = 0;
			for (const reply of replies) {
				sent.push(JSON.stringify(reply));
			}
		};

		// Warm both paths up so they're compared once optimised
		for (let i = 0; i < 5; i++) {
			sendAll();
			jsonEncodeAll();
		}

		const sendTimes: number[] = [];
		const jsonTimes: number[] = [];
		for (let i = 0; i < 9; i++) {
			let start = performance.now();
			sendAll();
			sendTimes.push(performance.now() - start);
			expect(sent).toHaveLength(replies.length);

			start = performance.now();
			jsonEncodeAll();
			jsonTimes.push(performance.now() - start);
		}

		const ratio = median(sendTimes) / median(jsonTimes);
		expect(
			ratio,
			`send() took ${median(sendTimes).toFixed(1)}ms for ${totalChars} characters of module code, ` +
				`${ratio.toFixed(1)}x the ${median(jsonTimes).toFixed(1)}ms JSON.stringify() takes`
		).toBeLessThan(2);
	});
});
