import * as fs from "node:fs";
import * as path from "node:path";
// The built plugin, which reads the internal Workers bundled alongside it.
import { pluginCloudflare } from "@cloudflare/rsbuild-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createRsbuild } from "@rsbuild/core";
import getPort from "get-port";
import { onTestFinished } from "vitest";
import type { RsbuildConfig } from "@rsbuild/core";

/**
 * Copies a fixture so that tests can modify its files. The copy stays inside
 * this package so that the fixture's imports (such as `cf/config`) resolve.
 *
 * @param name The fixture directory name.
 * @returns The path of the copy, which is removed when the test finishes.
 */
export function copyFixture(name: string): string {
	const tmpRoot = path.join(import.meta.dirname, "..", "..", ".tmp");
	fs.mkdirSync(tmpRoot, { recursive: true });
	const root = fs.mkdtempSync(path.join(tmpRoot, `${name}-`));
	fs.cpSync(path.join(import.meta.dirname, "fixtures", name), root, {
		recursive: true,
		filter: (source) => !/[/\\](\.cloudflare|dist)$/.test(source),
	});
	onTestFinished(() => removeDirSync(root));
	return root;
}

function createFixtureRsbuild(root: string, config: RsbuildConfig) {
	return createRsbuild({
		cwd: root,
		config: {
			...config,
			plugins: [
				pluginCloudflare({
					persistState: false,
					inspectorPort: false,
					types: { generate: false },
				}),
			],
			logLevel: "warn",
		},
	});
}

/**
 * Starts an Rsbuild dev server for a fixture copy with the Cloudflare plugin.
 *
 * @param root The fixture root.
 * @param config Additional Rsbuild config from the fixture's `rsbuild.config.ts`.
 * @returns The dev server's URL, closed when the test finishes.
 */
export async function startDevServer(
	root: string,
	config: RsbuildConfig = {}
): Promise<string> {
	const rsbuild = await createFixtureRsbuild(root, {
		...config,
		server: { port: await getPort(), strictPort: true },
	});
	const { server, urls } = await rsbuild.startDevServer();
	onTestFinished(() => server.close());
	const [url] = urls;
	if (url === undefined) {
		throw new Error("The dev server didn't report a URL.");
	}
	return url;
}

/**
 * Runs a production build for a fixture copy with the Cloudflare plugin.
 *
 * @param root The fixture root.
 * @param config Additional Rsbuild config from the fixture's `rsbuild.config.ts`.
 */
export async function build(
	root: string,
	config: RsbuildConfig = {}
): Promise<void> {
	const rsbuild = await createFixtureRsbuild(root, config);
	const { close } = await rsbuild.build();
	await close();
}

/**
 * Starts an Rsbuild preview server for a fixture copy that has been built.
 *
 * @param root The fixture root.
 * @returns The preview server's URL, closed when the test finishes.
 */
export async function startPreviewServer(root: string): Promise<string> {
	const rsbuild = await createFixtureRsbuild(root, {
		server: { port: await getPort(), strictPort: true },
	});
	const { server, urls } = await rsbuild.preview();
	onTestFinished(() => server.close());
	const [url] = urls;
	if (url === undefined) {
		throw new Error("The preview server didn't report a URL.");
	}
	return url;
}
