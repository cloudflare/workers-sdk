import path from "node:path";
import { miniflareTest, MiniflareTestContext } from "../../test-shared";
import type { D1Database } from "@cloudflare/workers-types/experimental";
import type { Miniflare, MiniflareOptions } from "miniflare";

const FIXTURES_PATH = path.resolve(__dirname, "../../fixtures");

export interface Context extends MiniflareTestContext {
	db: D1Database;
	tableColours: string;
	tableKitchenSink: string;
	tablePalettes: string;
	bindings: Record<string, unknown>;
}

export let binding: string;
export let opts: MiniflareOptions;
export let ctx: Context;
export let getDatabase: (mf: Miniflare) => Promise<D1Database>;

export function setupTest(
	newBinding: string,
	newScriptName: string,
	newGetDatabase: (mf: Miniflare) => Promise<D1Database>
) {
	binding = newBinding;
	opts = {
		modules: true,
		scriptPath: path.join(FIXTURES_PATH, "d1", newScriptName),
		d1Databases: { [newBinding]: "db" },
	};
	ctx = miniflareTest<unknown, Context>(opts);
	getDatabase = newGetDatabase;
}
