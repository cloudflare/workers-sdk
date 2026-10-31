import { WorkerEntrypoint } from "cloudflare:workers";
interface Env {
	BROKER: Fetcher;
}
interface Props {
	binding: string;
	audience: string;
	subject?: "worker" | "durable-object-namespace";
	request_signing?: { allowed_origins: string[]; allowed_methods: string[] };
}
const LIMIT = 8_388_608;
export class IdentityBinding extends WorkerEntrypoint<Env> {
	async #invoke(call: object, signal?: AbortSignal): Promise<Response> {
		const props = this.ctx.props as unknown as Props;
		if (props.subject && props.subject !== "worker")
			throw new Error(
				"Local namespace attestation is unavailable. Use a Worker subject binding."
			);
		const response = await this.env.BROKER.fetch("http://oidc/invoke", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ binding: props.binding, ...call }),
			signal,
		});
		return response;
	}
	async getToken(...args: unknown[]): Promise<string> {
		if (args.length)
			throw new TypeError(
				"getToken() takes no arguments. Configure another binding for a different audience."
			);
		const response = await this.#invoke({ operation: "token" });
		if (!response.ok)
			throw new Error(
				"Local OIDC issuance failed. Check the dev server for login or permission errors."
			);
		return response.text();
	}
	async getAuthorizationGrant(
		options: { authorizationServer: string; scope?: string[] },
		...extra: unknown[]
	): Promise<string> {
		if (
			extra.length ||
			!options ||
			typeof options !== "object" ||
			Reflect.ownKeys(options).some(
				(k) => !["authorizationServer", "scope"].includes(String(k))
			)
		)
			throw new TypeError(
				"Supply authorizationServer and optional scope tokens only."
			);
		const response = await this.#invoke({
			operation: "grant",
			grant: {
				authorization_server: options.authorizationServer,
				...(options.scope === undefined ? {} : { scope: options.scope }),
			},
		});
		if (!response.ok)
			throw new Error(
				"Local WAG issuance failed. Check the configured AS/scopes and development authorization."
			);
		return response.text();
	}
	checkSignedFetch(target: string, method: string): void {
		const policy = (this.ctx.props as unknown as Props).request_signing;
		if (!policy)
			throw new Error(
				"HTTP signing is disabled. Configure request_signing on this binding."
			);
		const url = new URL(target);
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.hash ||
			!policy.allowed_origins.includes(url.origin) ||
			!policy.allowed_methods.includes(method)
		)
			throw new TypeError(
				"Signed fetch destination or method is not configured."
			);
	}
	override async fetch(
		input: Request | string | URL,
		init?: RequestInit
	): Promise<Response> {
		const policy = (this.ctx.props as unknown as Props).request_signing;
		if (!policy)
			throw new Error(
				"HTTP signing is disabled. Configure request_signing on this binding."
			);
		if (init?.redirect !== undefined && init.redirect !== "error")
			throw new TypeError("Signed fetch requires redirect: error.");
		const allowed = [
			"method",
			"headers",
			"body",
			"redirect",
			"signal",
			"integrity",
			"keepalive",
			"credentials",
			"mode",
			"cache",
			"referrer",
			"referrerPolicy",
			"duplex",
		];
		if (init && Reflect.ownKeys(init).some((k) => !allowed.includes(String(k))))
			throw new TypeError("Unsupported request transport override.");
		// The internal wrapper already rejects caller routing/framing headers.
		// The HTTP service transport supplies its own content length.
		const request = new Request(input, { ...init, redirect: "manual" });
		this.checkSignedFetch(request.url, request.method);
		const declaredLength = request.headers.get("content-length");
		if (
			declaredLength !== null &&
			(!/^\d+$/.test(declaredLength) || Number(declaredLength) > LIMIT)
		)
			throw new RangeError(
				"Signed request body exceeds 8388608 bytes or has invalid framing."
			);
		request.headers.delete("content-length");
		request.headers.delete("host");
		let body: string | undefined;
		if (request.body) {
			const reader = request.body.getReader();
			let size = 0;
			const chunks: Uint8Array[] = [];
			const abort = () => {
				void reader.cancel(request.signal.reason).catch(() => {});
			};
			request.signal.addEventListener("abort", abort, { once: true });
			try {
				for (;;) {
					request.signal.throwIfAborted();
					const { done, value } = await reader.read();
					request.signal.throwIfAborted();
					if (done) break;
					size += value.byteLength;
					if (size > LIMIT)
						throw new RangeError("Signed request body exceeds 8388608 bytes.");
					chunks.push(value);
				}
			} catch (error) {
				await reader.cancel().catch(() => {});
				throw error;
			} finally {
				request.signal.removeEventListener("abort", abort);
				reader.releaseLock();
			}
			if (declaredLength !== null && Number(declaredLength) !== size)
				throw new TypeError("Signed request framing does not match the body.");
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.length;
			}
			let binary = "";
			for (let i = 0; i < bytes.length; i += 8192)
				binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
			body = btoa(binary);
		}
		request.signal.throwIfAborted();
		const response = await this.#invoke(
			{
				operation: "fetch",
				request: {
					url: request.url,
					method: request.method,
					headers: [...request.headers],
					...(body === undefined ? {} : { body }),
				},
			},
			request.signal
		);
		if (response.headers.get("X-MF-OIDC-Result") !== "fetch")
			throw new Error(
				"Local signed dispatch failed. Check the dev server for authorization or transport errors."
			);
		const result = new Response(response.body, response);
		result.headers.delete("X-MF-OIDC-Result");
		return result;
	}
}
export default {
	fetch() {
		return new Response("Use an OIDC binding.", { status: 403 });
	},
} satisfies ExportedHandler<Env>;
