import assert from "node:assert";
import crypto from "node:crypto";
import { cp } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { fetch } from "undici";
import { expect, onTestFinished, vi } from "vitest";
import {
	generateLeafCertificate,
	generateMtlsCertName,
	generateRootCertificate,
} from "./cert";
import { generateResourceName } from "./generate-resource-name";
import { makeRoot, removeFiles, seed } from "./setup";
import {
	MINIFLARE_IMPORT,
	runWrangler,
	WRANGLER_IMPORT,
	WranglerLongLivedCommand,
} from "./wrangler";
import type { WranglerCommandOptions } from "./wrangler";
import type { Awaitable } from "miniflare";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export function importWrangler(): Promise<typeof import("../../src/cli")> {
	return import(WRANGLER_IMPORT.href);
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export function importMiniflare(): Promise<typeof import("miniflare")> {
	return import(MINIFLARE_IMPORT.href);
}

/**
 * Use this class in your e2e tests to create a temp directory, seed it with files
 * and then run various Wrangler commands.
 */
export class WranglerE2ETestHelper {
	constructor(
		/** Provide an alternative to `onTestFinished` to handle tearing down resources. */
		public readonly onTeardown: (
			fn: () => Awaitable<void>,
			timeoutMs?: number
		) => void = onTestFinished
	) {}

	/** A temporary directory where files will be seeded and commands will be run. */
	tmpPath = makeRoot();

	/** Write files into the `tmpPath` directory. */
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

	/** Remove files from the `tmpPath` directory. */
	async removeFiles(files: string[]) {
		await removeFiles(this.tmpPath, files);
	}

	/** Run a Wrangler command that will not immediately exit, such as `wrangler dev`. */
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

	/** Run a Wrangler command that will execute and exit, such as `wrangler whoami` */
	async run(
		wranglerCommand: string,
		{ cwd = this.tmpPath, ...options }: WranglerCommandOptions = {}
	) {
		return runWrangler(wranglerCommand, { cwd, ...options });
	}

	/** Create a KV namespace and clean it up during tear-down. */
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
		this.onTeardown(async () => {
			await this.run(`wrangler kv namespace delete --namespace-id ${id}`);
		});
		return id;
	}

	/** Create a WfP dispatch namespace and clean it up during tear-down. */
	async dispatchNamespace(isLocal: boolean) {
		const name = generateResourceName("dispatch");
		if (isLocal) {
			throw new Error(
				"Dispatch namespaces are not supported in local mode (yet)"
			);
		}
		await this.run(`wrangler dispatch-namespace create ${name}`);
		this.onTeardown(async () => {
			await this.run(`wrangler dispatch-namespace delete ${name}`);
		});
		return name;
	}

	/**
	 * Create an R2 bucket and then clean it up during tear-down.
	 *
	 * Be aware that it is not possible to delete an R2 bucket that still contains objects.
	 * So the caller will be responsible for removing all objects at the end of the test.
	 */
	async r2(isLocal: boolean) {
		const name = generateResourceName("r2");
		if (isLocal) {
			return name;
		}
		await this.run(`wrangler r2 bucket create ${name}`);
		this.onTeardown(async () => {
			await this.run(`wrangler r2 bucket delete ${name}`);
		});
		return name;
	}

	/** Create a D1 database and clean it up during tear-down. */
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
		this.onTeardown(async () => {
			await this.run(`wrangler d1 delete -y ${name}`);
		}, 15_000);

		return { id, name };
	}

	/** Create a Vectorize index and clean it up during tear-down. */
	async vectorize(dimensions: number, metric: string, resourceName?: string) {
		// vectorize does not have a local dev mode yet, so we don't yet support the isLocal flag here
		const name = resourceName ?? generateResourceName("vectorize");
		if (!resourceName) {
			await this.run(
				`wrangler vectorize create ${name} --dimensions ${dimensions} --metric ${metric}`
			);
		}
		this.onTeardown(async () => {
			if (!resourceName) {
				await this.run(`wrangler vectorize delete ${name}`);
			}
		});

		return name;
	}

	/** Create a Hyperdrive connection and clean it up during tear-down. */
	async hyperdrive(
		isLocal: boolean,
		scheme: "postgresql" | "mysql" = "postgresql"
	): Promise<{ id: string; name: string }> {
		const name = generateResourceName("hyperdrive");

		if (isLocal) {
			return { id: crypto.randomUUID(), name };
		}

		const envVar =
			scheme === "mysql"
				? "HYPERDRIVE_MYSQL_DATABASE_URL"
				: "HYPERDRIVE_DATABASE_URL";
		const connectionString = process.env[envVar];

		assert(
			connectionString,
			`${envVar} must be set in order to create a Hyperdrive resource for this test`
		);

		const result = await this.run(
			`wrangler hyperdrive create ${name} --connection-string="${connectionString}"`
		);
		const tomlMatch = /id = "([0-9a-f]{32})"/.exec(result.stdout);
		const jsonMatch = /"id": "([0-9a-f]{32})"/.exec(result.stdout);
		const match = jsonMatch ?? tomlMatch;
		assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
		const id = match[1];
		this.onTeardown(async () => {
			await this.run(`wrangler hyperdrive delete ${id}`);
		});

		return { id, name };
	}

	/** Create a mTLS certificate and clean it up during tear-down. */
	async cert() {
		// Generate root and leaf certificates
		const { certificate: rootCert, privateKey: rootKey } =
			generateRootCertificate();
		const { certificate: leafCert, privateKey: leafKey } =
			generateLeafCertificate(rootCert, rootKey);

		// locally generated certs/key
		await this.seed({ "mtls_client_cert_file.pem": leafCert });
		await this.seed({ "mtls_client_private_key_file.pem": leafKey });

		const name = generateMtlsCertName();
		const output = await this.run(
			`wrangler cert upload mtls-certificate --name ${name} --cert "mtls_client_cert_file.pem" --key "mtls_client_private_key_file.pem"`
		);
		const match = output.stdout.match(/ID:\s+(?<certId>.*)$/m);
		const certificateId = match?.groups?.certId;
		assert(certificateId, `Cannot find ID in ${JSON.stringify(output)}`);
		this.onTeardown(async () => {
			await this.run(`wrangler cert delete --name ${name}`);
		});
		return certificateId;
	}

	/**
	 * Create a worker for the test and attempt to delete it after the test has finished.
	 *
	 * If this is called inside a beforeXxx hook the helper cannot call onTestFinished,
	 * in which case it is the caller's responsibility to set `cleanOnTestFinished` to false
	 * and then call `cleanup` returned from this helper.
	 */
	async worker(options: {
		workerName: string;
		entryPoint?: string;
		configPath?: string;
		extraFlags?: string[];
		cleanOnTestFinished: false;
	}): Promise<{
		deployedUrl: string;
		stdout: string;
		cleanup: () => Promise<void>;
	}>;
	async worker(options: {
		workerName: string;
		entryPoint?: string;
		configPath?: string;
		extraFlags?: string[];
		cleanOnTestFinished?: boolean;
	}): Promise<{
		deployedUrl: string;
		stdout: string;
	}>;
	async worker({
		workerName,
		entryPoint = "",
		configPath,
		extraFlags = [],
		cleanOnTestFinished = true,
	}: {
		workerName: string;
		entryPoint?: string;
		configPath?: string;
		extraFlags?: string[];
		cleanOnTestFinished?: boolean;
	}) {
		const configOption = configPath ? `-c ${configPath}` : "";
		const workerNameOption = `--name ${workerName}`;
		const { stdout } = await this.run(
			`wrangler deploy ${entryPoint} ${workerNameOption} ${configOption} --compatibility-date 2025-01-01 ${extraFlags.join(" ")}`
		);

		const urlMatcher = new RegExp(
			`(?<url>https:\\/\\/${workerName}\\..+?\\.workers\\.dev)`
		);

		const deployedUrl = stdout.match(urlMatcher)?.groups?.url;
		assert(deployedUrl, `Cannot find URL in ${JSON.stringify(stdout)}`);

		// Wait a couple of seconds before we start blasting the worker with requests
		// to allow it to complete deployment.
		await setTimeout(2_000);

		// Wait for the worker to become available
		await vi.waitFor(
			async () => {
				const response = await fetch(deployedUrl);
				expect(response.status).toBe(200);
			},
			{ timeout: 10_000, interval: 500 }
		);

		const cleanup = async () => {
			await this.run(`wrangler delete --name ${workerName} --force`);
		};

		if (cleanOnTestFinished) {
			try {
				this.onTeardown(cleanup, 15_000);
			} catch (e) {
				throw new Error(
					"Failed to register cleanup for worker.\nPerhaps you called this outside an `it` block?\nIf so, pass `cleanOnTestFinished: false` and then use the returned `cleanup` helper yourself",
					{ cause: e }
				);
			}
			return { deployedUrl, stdout };
		} else {
			return { deployedUrl, stdout, cleanup };
		}
	}

	/** Create a ZeroTrust tunnel and clean it up during tear-down. */
	async tunnel(): Promise<string> {
		const Cloudflare = (await import("cloudflare")).default;

		const name = generateResourceName("tunnel");
		const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
		if (!accountId) {
			throw new Error("CLOUDFLARE_ACCOUNT_ID environment variable is required");
		}

		// Create Cloudflare client directly
		const client = new Cloudflare({
			apiToken: process.env.CLOUDFLARE_API_TOKEN,
		});

		// Create tunnel via Cloudflare SDK
		const tunnel = await client.zeroTrust.tunnels.cloudflared.create({
			account_id: accountId,
			name,
			config_src: "cloudflare",
		});

		if (!tunnel.id) {
			throw new Error("Failed to create tunnel: tunnel ID is undefined");
		}

		const tunnelId = tunnel.id;

		this.onTeardown(async () => {
			try {
				await client.zeroTrust.tunnels.cloudflared.delete(tunnelId, {
					account_id: accountId,
				});
			} catch (error) {
				// Ignore deletion errors in cleanup
				console.warn(`Failed to delete tunnel ${tunnelId}:`, error);
			}
		});

		return tunnelId;
	}
}
