import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
// Allow for cold Node starts on Windows
const subprocessTimeout = process.platform === "win32" ? 30_000 : 10_000;

it(
	"exports the converter from the built @cloudflare/autoconfig/wrangler-to-cf entry",
	({ expect }) => {
		// A separate Node process resolves the package export like a consumer does
		const output = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`const { convertWranglerConfig } = await import("@cloudflare/autoconfig/wrangler-to-cf");
const { base } = convertWranglerConfig({ name: "worker", compatibility_date: "2026-01-01", kv_namespaces: [{ binding: "KV", id: "kv-id" }] });
console.log(JSON.stringify(base.config));`,
			],
			{ cwd: packageRoot, encoding: "utf8", timeout: subprocessTimeout }
		);

		expect(output).toContain('"callee":"bindings.kv"');
	},
	subprocessTimeout + 5_000
);
