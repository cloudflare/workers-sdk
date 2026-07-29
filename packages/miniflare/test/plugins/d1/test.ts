import fs from "node:fs/promises";
import path from "node:path";
import { miniflareTest, singleModuleManifest } from "../../test-shared";
import type { MiniflareTestContext } from "../../test-shared";
import type { D1Database } from "@cloudflare/workers-types/experimental";
import type { Miniflare, MiniflareOptions } from "miniflare";

const FIXTURES_PATH = path.resolve(__dirname, "../../fixtures");

export interface Context extends MiniflareTestContext {
	db: D1Database;
	tableColours: string;
	tableKitchenSink: string;
	tablePalettes: string;
}

export let binding: string;
export let opts: MiniflareOptions;
export let ctx: Context;
export let getDatabase: (mf: Miniflare) => Promise<D1Database>;

export async function setupTest(
	newBinding: string,
	newScriptName: string,
	newGetDatabase: (mf: Miniflare) => Promise<D1Database>
) {
	binding = newBinding;
	const script = await fs.readFile(
		path.join(FIXTURES_PATH, "d1", newScriptName),
		"utf8"
	);
	opts = {
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(script),
					env: { [newBinding]: { type: "d1", id: "db" } },
				},
			},
		],
	};
	ctx = miniflareTest<unknown, Context>(opts);
	getDatabase = newGetDatabase;
}
