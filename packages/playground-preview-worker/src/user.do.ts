import assert from "node:assert";
import z from "zod";
import { BadUpload, ServiceWorkerNotSupported, WorkerTimeout } from "./errors";
import { constructMiddleware } from "./inject-middleware";
import { doUpload, setupTokens } from "./realish";
import { handleException, setupSentry } from "./sentry";
import type { RealishPreviewConfig, UploadResult } from "./realish";

function switchRemote(url: URL, remote: string) {
	const workerUrl = new URL(url);
	const remoteUrl = new URL(remote);
	workerUrl.hostname = remoteUrl.hostname;
	workerUrl.protocol = remoteUrl.protocol;
	workerUrl.port = remoteUrl.port;
	return workerUrl;
}

const UploadedMetadata = z.object({
	body_part: z.ostring(),
	main_module: z.ostring(),
	compatibility_date: z.ostring(),
	compatibility_flags: z.array(z.string()).optional(),
});

type UploadedMetadata = z.infer<typeof UploadedMetadata>;

/**
 * This Durable object coordinates operations for a specific user session. It's purpose is to
 * communicate with the Realish preview service on behalf of a user, without leaking more info
 * than necessary. It:
 *  - Maintains a Realish preview session on behalf of the user
 *  - Handles worker uploads, inflating them with the relevant Realish preview authentication for the upload
 *  - Proxies inspector connections to the current inspector URL for the Realish preview session
 *  - Proxies tail connections to the current live logs URL for the Realish preview session
 *  - Forwards requests to the running previewed user worker
 */
export class UserSession {
	config: RealishPreviewConfig | undefined;
	previewToken: string | undefined;
	tailUrl: string | undefined;
	workerName!: string;
	constructor(
		private state: DurableObjectState,
		private env: Env
	) {
		void this.state.blockConcurrencyWhile(async () => {
			this.config =
				await this.state.storage.get<RealishPreviewConfig>("config");
			let workerName = await this.state.storage.get<string>("workerName");
			if (!workerName) {
				workerName = crypto.randomUUID();
				await this.state.storage.put<string>("workerName", workerName);
			}
			this.workerName = workerName;

			this.previewToken = await this.state.storage.get<string>("previewToken");
			this.tailUrl = await this.state.storage.get<string>("tailUrl");
		});
	}
	async refreshTokens() {
		this.config = await setupTokens(this.env.ACCOUNT_ID, this.env.API_TOKEN);
		await this.state.storage.put("config", this.config);
	}
	async uploadWorker(name: string, worker: FormData) {
		worker.set(
			"wrangler-session-config",
			JSON.stringify({ workers_dev: true })
		);
		if (this.config === undefined) {
			console.log("Setting up tokens");
			await this.refreshTokens();
			assert(this.config !== undefined);
		}
		let uploadResult: UploadResult;
		try {
			uploadResult = await doUpload(
				this.env.ACCOUNT_ID,
				this.env.API_TOKEN,
				this.config,
				name,
				worker
			);
		} catch {
			// Try to recover _once_ from failure. This captures expired tokens, but means that genuine failures won't cause
			// a request loop and will return an error to the user
			await this.refreshTokens();
			uploadResult = await doUpload(
				this.env.ACCOUNT_ID,
				this.env.API_TOKEN,
				this.config,
				name,
				worker
			);
		}

		this.previewToken = uploadResult.result.preview_token;
		this.tailUrl = uploadResult.result.tail_url;

		await this.state.storage.put("previewToken", this.previewToken);
		await this.state.storage.put("tailUrl", this.tailUrl);
	}

	async handleRequest(request: Request) {
		// This is a request to run the user-worker. Forward, adding the correct authentication headers
		if (request.headers.has("cf-run-user-worker")) {
			assert(this.previewToken !== undefined);

			const workerResponse = await fetch(
				switchRemote(
					new URL(request.url),
					`https://${this.workerName}.${this.env.workersDev}`
				),
				new Request(request, {
					headers: {
						...Object.fromEntries(request.headers),
						"cf-workers-preview-token": this.previewToken,
					},
					redirect: "manual",
				})
			);

			// Check for expired previews and show a friendlier error page
			if (workerResponse.status === 400) {
				const clone = await workerResponse.clone().text();
				if (clone.includes("Invalid Workers Preview configuration")) {
					throw new WorkerTimeout();
				}
				return workerResponse;
			}
			return workerResponse;
		}

		const userSession = this.state.id.toString();

		let worker: FormData;
		try {
			worker = await request.formData();
		} catch (e) {
			throw new BadUpload(`Expected valid form data`, String(e));
		}

		const m = worker.get("metadata") as unknown;
		if (!(m instanceof File)) {
			throw new BadUpload("Expected metadata file to be defined");
		}

		let uploadedMetadata: UploadedMetadata;
		try {
			uploadedMetadata = UploadedMetadata.parse(JSON.parse(await m.text()));
		} catch {
			throw new BadUpload("Expected metadata file to be valid");
		}

		if (
			uploadedMetadata.body_part !== undefined ||
			uploadedMetadata.main_module === undefined
		) {
			throw new ServiceWorkerNotSupported();
		}

		const today = new Date();

		const year = String(today.getUTCFullYear());

		const month = String(today.getUTCMonth() + 1).padStart(2, "0");

		const date = String(today.getUTCDate()).padStart(2, "0");

		const metadata = {
			main_module: uploadedMetadata.main_module,
			compatibility_date:
				uploadedMetadata?.compatibility_date ?? `${year}-${month}-${date}`,
			compatibility_flags: uploadedMetadata?.compatibility_flags ?? [
				"nodejs_compat",
			],
			// TODO(soon): Add a CPU time limiter once standard pricing is out
			usage_model: "unbound",
		};

		let entrypoint = uploadedMetadata.main_module;
		let additionalModules = new FormData();

		const entrypointModule = worker.get(uploadedMetadata.main_module);

		// Only apply middleware if the entrypoint is an ES6 module
		if (
			entrypointModule instanceof File &&
			entrypointModule.type === "application/javascript+module"
		) {
			({ entrypoint, additionalModules } = constructMiddleware(
				uploadedMetadata.main_module
			));
		}

		metadata.main_module = entrypoint;

		for (const [path, additionalModule] of additionalModules.entries()) {
			assert(additionalModule instanceof File);
			worker.set(path, additionalModule);
		}

		worker.set(
			"metadata",
			new File([JSON.stringify(metadata)], "metadata", {
				type: "application/json",
			})
		);

		await this.uploadWorker(this.workerName, worker);

		assert(this.tailUrl !== undefined);

		return Response.json({
			tail: this.tailUrl,
			preview: userSession,
		});
	}

	async fetch(request: Request) {
		// We need to construct a new Sentry instance here because throwing
		// errors across a DO boundary will wipe stack information etc...
		const sentry = setupSentry(
			request,
			undefined,
			this.env.SENTRY_DSN,
			this.env.SENTRY_ACCESS_CLIENT_ID,
			this.env.SENTRY_ACCESS_CLIENT_SECRET
		);

		try {
			return await this.handleRequest(request);
		} catch (e) {
			return handleException(e, sentry);
		}
	}
}
