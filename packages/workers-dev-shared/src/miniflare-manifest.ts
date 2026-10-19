import assert from "node:assert";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { ModuleType } from "@cloudflare/config";
import type { WorkerOptions } from "miniflare";

/** A Worker bundle from the Build Output Specification. */
export interface Bundle {
	rootPath: string;
	mainModule: string;
	modules: Record<string, { type: ModuleType }>;
}

/**
 * Read a Build Output Specification manifest into Miniflare's native module
 * manifest shape.
 */
export async function getMiniflareManifest(
	bundle: Bundle
): Promise<NonNullable<WorkerOptions["config"]["manifest"]>> {
	const { mainModule } = bundle;
	const mainEntry = bundle.modules[mainModule];
	assert(
		mainEntry !== undefined,
		`Build Output Specification: \`mainModule\` "${mainModule}" is missing from \`modules\`.`
	);

	const modules: NonNullable<WorkerOptions["config"]["manifest"]>["modules"] =
		{};
	await Promise.all(
		Object.entries(bundle.modules).map(async ([modulePath, { type }]) => {
			const contents = await fsp.readFile(
				path.join(bundle.rootPath, modulePath)
			);
			modules[modulePath] = {
				type,
				contents:
					type === "wasm" || type === "data"
						? new Uint8Array(contents)
						: contents.toString(),
			};
		})
	);

	return {
		mainModule,
		modulesRoot: bundle.rootPath,
		modules,
	};
}
