import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import {
	emitStandaloneBundle,
	STANDALONE_CONFIG_FILENAME,
	toStandaloneConfig,
} from "miniflare";
import { afterEach, test } from "vitest";
import workerdPath from "workerd";
import type { Config, StandaloneConfigFormat } from "miniflare";
import type { ExpectStatic } from "vitest";

const USER_SERVICE = "core:user:my-app";

const tempDirs: string[] = [];
function makeTempDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "mf-standalone-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir !== undefined) {
			removeDirSync(dir);
		}
	}
});

const WORKER_SOURCE = `export default {
	async fetch(request, env) {
		return Response.json({
			ok: true,
			greeting: env.GREETING,
			secret: env.SECRET ?? null,
		});
	},
};
`;

/**
 * Builds a fixture resembling a Miniflare-assembled config for a stateless worker:
 * the user worker plus the development-only scaffolding (loopback, dev entry,
 * `strip-cf-connecting-ip`, cache) that the transform must strip.
 */
function makeFixtureConfig(assetsDir: string): Config {
	return {
		services: [
			{ name: "loopback", external: { address: "127.0.0.1:1234", http: {} } },
			{
				name: "core:entry",
				worker: {
					modules: [{ name: "entry.js", esModule: "export default {}" }],
					compatibilityDate: "2024-11-01",
				},
			},
			{
				name: "strip-cf-connecting-ip:0",
				worker: {
					modules: [{ name: "strip.js", esModule: "export default {}" }],
					compatibilityDate: "2024-11-01",
				},
			},
			{
				name: "cache:0",
				worker: {
					modules: [{ name: "cache.js", esModule: "export default {}" }],
					compatibilityDate: "2024-11-01",
				},
			},
			{
				name: USER_SERVICE,
				worker: {
					modules: [{ name: "index.js", esModule: WORKER_SOURCE }],
					compatibilityDate: "2024-11-01",
					compatibilityFlags: ["nodejs_compat"],
					bindings: [
						{ name: "GREETING", text: "hello from standalone" },
						{ name: "SECRET", fromEnvironment: "SECRET" },
						{ name: "ASSETS", service: { name: "assets:storage" } },
						{
							name: "RATE_LIMITER",
							wrapped: { moduleName: "cloudflare-internal:ratelimit" },
						},
					],
					globalOutbound: { name: "strip-cf-connecting-ip:0" },
					cacheApiOutbound: { name: "cache:0" },
				},
			},
			{
				// Miniflare assembles the assets disk as writable; the transform must
				// flip it read-only for the production bundle.
				name: "assets:storage",
				disk: { path: assetsDir, writable: true, allowDotfiles: true },
			},
			{ name: "internet", network: { allow: ["public", "private"], deny: [] } },
		],
		extensions: [
			{
				modules: [
					// Imported transitively by the kept rate-limit module below.
					{ name: "miniflare:shared", internal: true, esModule: "export {}" },
					// Referenced by the user worker's `wrapped` binding (kept).
					{
						name: "cloudflare-internal:ratelimit",
						internal: true,
						esModule: `import "miniflare:shared";\nexport default function () {\n\treturn { limit() {} };\n};`,
					},
					// Nothing references these — they must be pruned.
					{
						name: "cloudflare-internal:workflows",
						internal: true,
						esModule: "export default {};",
					},
					{
						name: "cloudflare-internal:email",
						internal: true,
						esModule: "export default {};",
					},
				],
			},
		],
		sockets: [
			{
				name: "entry",
				service: { name: "core:entry" },
				http: {},
				address: "127.0.0.1:0",
			},
		],
	};
}

test("toStandaloneConfig keeps only reachable, non-dev services", ({
	expect,
}) => {
	const assetsDir = makeTempDir();
	const result = toStandaloneConfig(makeFixtureConfig(assetsDir));

	expect(result.entryService).toBe(USER_SERVICE);
	expect(new Set(result.keptServices)).toEqual(
		new Set([USER_SERVICE, "assets:storage", "internet"])
	);
	expect(result.droppedServices).toContain("loopback");
	expect(result.droppedServices).toContain("core:entry");
	expect(result.droppedServices).toContain("strip-cf-connecting-ip:0");
	expect(result.droppedServices).toContain("cache:0");

	// Single HTTP socket pointing at the entry worker.
	expect(result.config.sockets).toHaveLength(1);
	expect(result.config.sockets?.[0].service).toEqual({ name: USER_SERVICE });

	const user = result.config.services?.find((s) => s.name === USER_SERVICE);
	expect(user).toBeDefined();
	if (user === undefined || !("worker" in user) || user.worker === undefined) {
		throw new Error("expected user worker service");
	}
	// `globalOutbound` repointed away from the dev strip service.
	expect(user.worker.globalOutbound).toEqual({ name: "internet" });
	// `cacheApiOutbound` referencing the dev cache service is dropped.
	expect(user.worker.cacheApiOutbound).toBeUndefined();

	// Disk path relativized + copy recorded.
	expect(result.diskCopies).toEqual([
		{
			serviceName: "assets:storage",
			from: assetsDir,
			to: "disk/assets_storage",
		},
	]);
	const disk = result.config.services?.find((s) => s.name === "assets:storage");
	if (disk === undefined || !("disk" in disk) || disk.disk === undefined) {
		throw new Error("expected disk service");
	}
	expect(disk.disk.path).toBe("disk/assets_storage");
	// Static assets are read-only in the production bundle.
	expect(disk.disk.writable).toBe(false);
});

test("toStandaloneConfig prunes extension modules nothing references", ({
	expect,
}) => {
	const assetsDir = makeTempDir();
	const result = toStandaloneConfig(makeFixtureConfig(assetsDir));

	const keptModules = (result.config.extensions ?? [])
		.flatMap((extension) => extension.modules ?? [])
		.map((module) => module.name);

	// Referenced by the user worker's `wrapped` binding...
	expect(keptModules).toContain("cloudflare-internal:ratelimit");
	// ...and its transitive import is kept too.
	expect(keptModules).toContain("miniflare:shared");
	// Unreferenced simulator extensions are pruned.
	expect(keptModules).not.toContain("cloudflare-internal:workflows");
	expect(keptModules).not.toContain("cloudflare-internal:email");
	expect(result.droppedExtensionModules).toEqual(
		expect.arrayContaining([
			"cloudflare-internal:workflows",
			"cloudflare-internal:email",
		])
	);
});

test("pruneExtensions can be disabled", ({ expect }) => {
	const assetsDir = makeTempDir();
	const result = toStandaloneConfig(makeFixtureConfig(assetsDir), {
		pruneExtensions: false,
	});
	const keptModules = (result.config.extensions ?? [])
		.flatMap((extension) => extension.modules ?? [])
		.map((module) => module.name);
	expect(keptModules).toContain("cloudflare-internal:workflows");
	expect(result.droppedExtensionModules).toEqual([]);
});

test("emitStandaloneBundle writes config, modules, and disk contents", ({
	expect,
}) => {
	const assetsDir = makeTempDir();
	writeFileSync(path.join(assetsDir, "hello.txt"), "hi");
	const outDir = makeTempDir();

	const result = emitStandaloneBundle(makeFixtureConfig(assetsDir), outDir);

	const config = readFileSync(result.configPath, "utf8");
	expect(config).toContain('using Workerd = import "/workerd/workerd.capnp"');
	expect(config).toContain('name = "core:user:my-app"');
	expect(config).toContain("esModule = embed");
	expect(config).toContain('fromEnvironment = "SECRET"');
	// Dropped services must not appear.
	expect(config).not.toContain('name = "loopback"');
	expect(config).not.toContain("strip-cf-connecting-ip");

	// Module source embedded as a file and disk contents copied in.
	expect(result.files).toContain("src/index.js");
	expect(
		readFileSync(path.join(outDir, "disk/assets_storage/hello.txt"), "utf8")
	).toBe("hi");
});

function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				reject(new Error("could not determine port"));
				return;
			}
			const { port } = address;
			server.close(() => resolve(port));
		});
	});
}

async function waitForResponse(
	url: string,
	signal: AbortSignal
): Promise<Response> {
	while (!signal.aborted) {
		try {
			return await fetch(url);
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	throw new Error(`timed out waiting for ${url}`);
}

async function assertBundleServes(
	expect: ExpectStatic,
	format: StandaloneConfigFormat
): Promise<void> {
	const assetsDir = makeTempDir();
	const outDir = makeTempDir();
	const result = emitStandaloneBundle(makeFixtureConfig(assetsDir), outDir, {
		format,
	});
	expect(result.format).toBe(format);
	expect(path.basename(result.configPath)).toBe(
		STANDALONE_CONFIG_FILENAME[format]
	);
	// Binary inlines modules, so there must be no embedded `src/` files.
	expect(result.files.some((file) => file.startsWith("src/"))).toBe(
		format === "text"
	);

	const port = await getFreePort();
	const child = spawn(
		workerdPath,
		[
			"serve",
			...(format === "binary" ? ["--binary"] : []),
			STANDALONE_CONFIG_FILENAME[format],
			`--socket-addr=http=127.0.0.1:${port}`,
		],
		{ cwd: outDir, env: { ...process.env, SECRET: "shhh" }, stdio: "pipe" }
	);
	let stderr = "";
	child.stderr.on("data", (chunk) => (stderr += String(chunk)));

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
		const response = await waitForResponse(
			`http://127.0.0.1:${port}/`,
			controller.signal
		);
		clearTimeout(timeout);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			greeting: "hello from standalone",
			secret: "shhh",
		});
	} catch (error) {
		throw new Error(`workerd failed: ${String(error)}\nstderr:\n${stderr}`);
	} finally {
		child.kill("SIGKILL");
	}
}

test("emitted text bundle runs under bare workerd serve", async ({
	expect,
}) => {
	await assertBundleServes(expect, "text");
});

test("emitted binary bundle runs under workerd serve --binary", async ({
	expect,
}) => {
	await assertBundleServes(expect, "binary");
});
