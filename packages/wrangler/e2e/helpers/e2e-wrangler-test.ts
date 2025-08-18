import assert from "node:assert";
import crypto from "node:crypto";
import { cp } from "node:fs/promises";
import { onTestFinished } from "vitest";
import { generateResourceName } from "./generate-resource-name";
import { makeRoot, removeFiles, seed } from "./setup";
import {
	MINIFLARE_IMPORT,
	runWrangler,
	WRANGLER_IMPORT,
	WranglerLongLivedCommand,
} from "./wrangler";
import type { WranglerCommandOptions } from "./wrangler";

/**
 * Use this class in your e2e tests to create a temp directory, seed it with files
 * and then run various Wrangler commands.
 */
export class WranglerE2ETestHelper {
	tmpPath = makeRoot();

	async seed(files: Record<string, string | Uint8Array>): Promise<void>;
	async seed(sourceDir: string): Promise<void>;
	async seed(
		filesOrSourceDir: Record<string, string | Uint8Array> | string
	): Promise<void> {
		if (typeof filesOrSourceDir === "string") {
			await cp(filesOrSourceDir, this.tmpPath, { recursive: true });
		} else {
			await seed(this.tmpPath, filesOrSourceDir);
		}
	}

	async removeFiles(files: string[]) {
		await removeFiles(this.tmpPath, files);
	}

	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	importWrangler(): Promise<typeof import("../../src/cli")> {
		return import(WRANGLER_IMPORT.href);
	}

	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	importMiniflare(): Promise<typeof import("miniflare")> {
		return import(MINIFLARE_IMPORT.href);
	}

	runLongLived(
		wranglerCommand: string,
		{
			cwd = this.tmpPath,
			stopOnTestFinished = true,
			...options
		}: WranglerCommandOptions & { stopOnTestFinished?: boolean } = {}
	): WranglerLongLivedCommand {
		const wrangler = new WranglerLongLivedCommand(wranglerCommand, {
			cwd,
			...options,
		});
		if (stopOnTestFinished) {
			onTestFinished(async () => {
				await wrangler.stop();
			});
		}
		return wrangler;
	}

	async run(
		wranglerCommand: string,
		{ cwd = this.tmpPath, ...options }: WranglerCommandOptions = {}
	) {
		return runWrangler(wranglerCommand, { cwd, ...options });
	}

	async kv(isLocal: boolean) {
		const name = generateResourceName("kv" + Date.now()).replaceAll("-", "_");
		if (isLocal) {
			return name;
		}
		const result = await this.run(`wrangler kv namespace create ${name}`);
		const tomlMatch = /id = "([0-9a-f]{32})"/.exec(result.stdout);
		const jsonMatch = /"id": "([0-9a-f]{32})"/.exec(result.stdout);
		const match = jsonMatch ?? tomlMatch;
		assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
		const id = match[1];
		onTestFinished(async () => {
			await this.run(`wrangler kv namespace delete --namespace-id ${id}`);
		});
		return id;
	}

	async dispatchNamespace(isLocal: boolean) {
		const name = generateResourceName("dispatch");
		if (isLocal) {
			throw new Error(
				"Dispatch namespaces are not supported in local mode (yet)"
			);
		}
		await this.run(`wrangler dispatch-namespace create ${name}`);
		onTestFinished(async () => {
			await this.run(`wrangler dispatch-namespace delete ${name}`);
		});
		return name;
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
		const tomlMatch = /database_id = "([0-9a-f-]{36})"/.exec(result.stdout);
		const jsonMatch = /"database_id": "([0-9a-f-]{36})"/.exec(result.stdout);
		const match = jsonMatch ?? tomlMatch;
		assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
		const id = match[1];
		onTestFinished(async () => {
			await this.run(`wrangler d1 delete -y ${name}`);
		}, 15_000);

		return { id, name };
	}

	async vectorize(dimensions: number, metric: string, resourceName?: string) {
		// vectorize does not have a local dev mode yet, so we don't yet support the isLocal flag here
		const name = resourceName ?? generateResourceName("vectorize");
		if (!resourceName) {
			await this.run(
				`wrangler vectorize create ${name} --dimensions ${dimensions} --metric ${metric}`
			);
		}
		onTestFinished(async () => {
			if (!resourceName) {
				await this.run(`wrangler vectorize delete ${name}`);
			}
		});

		return name;
	}

	async hyperdrive(isLocal: boolean): Promise<{ id: string; name: string }> {
		const name = generateResourceName("hyperdrive");

		if (isLocal) {
			return { id: crypto.randomUUID(), name };
		}

		assert(
			process.env.HYPERDRIVE_DATABASE_URL,
			"HYPERDRIVE_DATABASE_URL must be set in order to create a Hyperdrive resource for this test"
		);

		const result = await this.run(
			`wrangler hyperdrive create ${name} --connection-string="${process.env.HYPERDRIVE_DATABASE_URL}"`
		);
		const tomlMatch = /id = "([0-9a-f]{32})"/.exec(result.stdout);
		const jsonMatch = /"id": "([0-9a-f]{32})"/.exec(result.stdout);
		const match = jsonMatch ?? tomlMatch;
		assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
		const id = match[1];

		onTestFinished(async () => {
			await this.run(`wrangler hyperdrive delete ${id}`);
		});

		return { id, name };
	}
}
