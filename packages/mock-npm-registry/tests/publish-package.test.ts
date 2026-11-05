import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import getPort from "get-port";
import { describe, test, vi } from "vitest";
import { packageManager } from "../../../package.json";
import { publishPackage, restoreLatestTag } from "../src/publish-package";

describe("publishPackage", () => {
	runInTempDir();

	test("keeps prerelease tags local and latest on the upstream stable version", async ({
		expect,
	}) => {
		const name = "@cloudflare/mock-npm-registry-dist-tag-test";
		const upstreamPort = await getPort();
		const upstreamUrl = `http://127.0.0.1:${upstreamPort}/`;
		const stable = {
			name,
			version: "1.0.0",
			dist: {
				tarball: `${upstreamUrl}stable.tgz`,
				shasum: "0".repeat(40),
			},
		};
		const upstream = createServer((request, response) => {
			response.setHeader("content-type", "application/json");
			response.end(
				JSON.stringify(
					request.url?.endsWith("/latest")
						? stable
						: {
								name,
								versions: { "1.0.0": stable },
								"dist-tags": { latest: "1.0.0" },
							}
				)
			);
		});
		upstream.listen(upstreamPort, "127.0.0.1");
		await once(upstream, "listening");
		const port = await getPort();
		const registry = `http://127.0.0.1:${port}/`;
		const configPath = path.resolve("verdaccio.yaml");
		const npmrc = path.resolve(".npmrc");
		writeFileSync(
			npmrc,
			`registry=${registry}\n//127.0.0.1:${port}/:_authToken=xxxx\ngit-checks=false\n`
		);
		vi.stubEnv("NPM_CONFIG_USERCONFIG", npmrc);
		vi.stubEnv("npm_config_userconfig", npmrc);
		vi.stubEnv("npm_config_registry", registry);

		async function startRegistry(withUplinks: boolean) {
			writeFileSync(
				configPath,
				JSON.stringify({
					listen: `127.0.0.1:${port}`,
					storage: path.resolve("storage"),
					uplinks: { npmJS: { url: upstreamUrl } },
					packages: {
						"**": {
							access: "$all",
							publish: "$all",
							...(withUplinks ? { proxy: "npmJS" } : {}),
						},
					},
					log: { type: "stdout", format: "pretty", level: "error" },
				})
			);
			const server = fork(
				require.resolve("verdaccio/bin/verdaccio"),
				["-c", configPath],
				{ stdio: "ignore" }
			);
			const exited = new Promise<void>((resolve) => {
				server.once("exit", () => resolve());
			});
			await once(server, "message");
			return async function stop() {
				server.kill();
				await exited;
			};
		}
		let stopRegistry = await startRegistry(false);
		try {
			const packagePath = path.resolve("package");
			mkdirSync(packagePath);
			writeFileSync(
				path.join(packagePath, "index.js"),
				"module.exports = {};\n"
			);
			async function publishFixture(
				version: string,
				tag?: string,
				packageName = name
			) {
				writeFileSync(
					path.join(packagePath, "package.json"),
					JSON.stringify({
						name: packageName,
						version,
						packageManager,
						files: ["index.js"],
						publishConfig: { registry },
						"workers-sdk": tag
							? { npmPrerelease: { tag, numbered: true } }
							: { prerelease: true },
					})
				);
				return publishPackage(packagePath, "ignore");
			}
			expect(
				await publishFixture("1.0.0", undefined, "stable-test-package")
			).toBe("latest");
			expect(await publishFixture("2.0.0-beta.0", "beta")).toBe("beta");
			expect(await publishFixture("2.0.0-rc.0", "rc")).toBe("rc");

			await expect(publishPackage(packagePath, "ignore")).rejects.toThrow(
				"pnpm publish"
			);
			await stopRegistry();
			stopRegistry = await startRegistry(true);
			await restoreLatestTag(name, registry, upstreamUrl);

			const tagsUrl = new URL(
				`/-/package/${encodeURIComponent(name)}/dist-tags`,
				registry
			);
			const tags = await fetch(tagsUrl);
			expect(await tags.json()).toEqual({
				latest: "1.0.0",
				beta: "2.0.0-beta.0",
				rc: "2.0.0-rc.0",
			});
		} finally {
			await stopRegistry();
			await new Promise<void>((resolve, reject) => {
				upstream.close((error) => (error ? reject(error) : resolve()));
			});
		}
	});
});
