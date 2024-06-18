import assert from "node:assert";
import crypto from "node:crypto";
import { onTestFinished } from "vitest";
import { generateResourceName } from "./generate-resource-name";
import { makeRoot, seed } from "./setup";
import { runWrangler, WranglerLongLivedCommand } from "./wrangler";
import type { WranglerCommandOptions } from "./wrangler";

/**
 * Use this class in your e2e tests to create a temp directory, seed it with files
 * and then run various Wrangler commands.
 */
export class WranglerE2ETestHelper {
	tmpPath = makeRoot();

	async seed(files: Record<string, string | Uint8Array>) {
		await seed(this.tmpPath, files);
	}

	runLongLived(
		wranglerCommand: string,
		{ cwd = this.tmpPath, ...options }: WranglerCommandOptions = {}
	): WranglerLongLivedCommand {
		const wrangler = new WranglerLongLivedCommand(wranglerCommand, {
			cwd,
			...options,
		});
		onTestFinished(async () => {
			await wrangler.stop();
		});
		return wrangler;
	}

	async run(
		wranglerCommand: string,
		{ cwd = this.tmpPath, ...options }: WranglerCommandOptions = {}
	) {
		return runWrangler(wranglerCommand, { cwd, ...options });
	}

	async kv(isLocal: boolean) {
		const name = generateResourceName("kv").replaceAll("-", "_");
		if (isLocal) {
			return name;
		}
		const result = await this.run(`wrangler kv namespace create ${name}`);
		const match = /id = "([0-9a-f]{32})"/.exec(result.stdout);
		assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
		const id = match[1];
		onTestFinished(async () => {
			await this.run(`wrangler kv namespace delete --namespace-id ${id}`);
		});
		return id;
	}

	async r2(isLocal: boolean) {
		const name = generateResourceName("r2");
		if (isLocal) {
			return name;
		}
		await this.run(`wrangler r2 bucket create ${name}`);
		onTestFinished(async () => {
			await this.run(`wrangler r2 bucket delete ${name}`);
		});
		return name;
	}

	async d1(isLocal: boolean) {
		const name = generateResourceName("d1");
		if (isLocal) {
			return { id: crypto.randomUUID(), name };
		}
		const result = await this.run(`wrangler d1 create ${name}`);
		const match = /database_id = "([0-9a-f-]{36})"/.exec(result.stdout);
		assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
		const id = match[1];
		onTestFinished(async () => {
			await this.run(`wrangler d1 delete -y ${id}`);
		});

		return { id, name };
	}
}
