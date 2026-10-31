import { isIdentityBinding } from "@cloudflare/workers-utils/oidc";
import {
	DevelopmentOidcRequestPool,
	snapshotDevelopmentOidcIdentity,
} from "miniflare";
import type { CfAccount } from "@cloudflare/workers-utils";
import type { IdentityBindingConfig } from "@cloudflare/workers-utils/oidc";
import type {
	DevelopmentOidcCall,
	DevelopmentOidcIdentity,
	DevelopmentOidcToken,
} from "miniflare";

export type DevelopmentIdentityBindingRequest = IdentityBindingConfig;
export interface DevelopmentOidcSession {
	binding: string;
	identity: DevelopmentOidcIdentity;
	defaultAudience: string;
	expiresAt: number;
}
type Grant = NonNullable<DevelopmentOidcCall["grant"]>;
type Dispatch = NonNullable<DevelopmentOidcCall["request"]>;
export interface DevelopmentOidcTransport {
	createSession(
		auth: CfAccount,
		workerName: string,
		binding: DevelopmentIdentityBindingRequest,
		signal: AbortSignal
	): Promise<DevelopmentOidcSession>;
	issueToken(
		auth: CfAccount,
		session: DevelopmentOidcSession,
		signal: AbortSignal
	): Promise<DevelopmentOidcToken>;
	issueGrant(
		auth: CfAccount,
		session: DevelopmentOidcSession,
		options: Grant,
		signal: AbortSignal
	): Promise<DevelopmentOidcToken>;
	dispatch(
		auth: CfAccount,
		session: DevelopmentOidcSession,
		request: Dispatch,
		signal: AbortSignal
	): Promise<Response>;
}
type OAuthAccount = CfAccount & { apiToken: { apiToken: string } };
interface SessionState {
	accountId: string;
	credential: string;
	controller: AbortController;
	session: Promise<DevelopmentOidcSession>;
	deadline?: number;
}

/** Host-only lifecycle. Cache sessions, never assertions or issuance promises. */
export class DevelopmentOidcProvider {
	#workerName: string;
	#binding: Readonly<DevelopmentIdentityBindingRequest>;
	#getAuth: (signal: AbortSignal) => Promise<CfAccount>;
	#transport: DevelopmentOidcTransport;
	#requests = new DevelopmentOidcRequestPool();
	#shutdown = new AbortController();
	#state?: SessionState;
	constructor(
		workerName: string,
		getAuth: (signal: AbortSignal) => Promise<CfAccount>,
		transport: DevelopmentOidcTransport,
		binding: DevelopmentIdentityBindingRequest
	) {
		if (
			!isIdentityBinding(binding) ||
			binding.subject === "durable-object-namespace" ||
			!/^[A-Za-z0-9_-]{1,63}$/.test(workerName)
		)
			throw new Error(
				"Local OIDC requires an existing Worker name and a valid Worker-subject binding."
			);
		this.#workerName = workerName;
		this.#binding = Object.freeze(structuredClone(binding));
		this.#getAuth = getAuth;
		this.#transport = {
			createSession: transport.createSession.bind(transport),
			issueToken: transport.issueToken.bind(transport),
			issueGrant: transport.issueGrant.bind(transport),
			dispatch: transport.dispatch.bind(transport),
		};
	}
	async getToken(...args: unknown[]): Promise<string> {
		if (args.length) throw new TypeError("getToken() takes no arguments.");
		return (
			await this.invoke({ binding: this.#binding.binding, operation: "token" })
		).text();
	}
	async invoke(
		call: DevelopmentOidcCall,
		parent?: AbortSignal
	): Promise<Response> {
		const operation = structuredClone(call);
		if (operation.binding !== this.#binding.binding)
			throw new Error("Development OIDC binding is not configured.");
		const signal = parent
			? AbortSignal.any([parent, this.#shutdown.signal])
			: this.#shutdown.signal;
		signal.throwIfAborted();
		let raw: CfAccount;
		try {
			raw = await this.#requests.run(this.#getAuth, signal);
		} catch (error) {
			this.#invalidate();
			throw error;
		}
		const credential =
			raw.apiToken && "apiToken" in raw.apiToken
				? raw.apiToken.apiToken
				: undefined;
		if (
			!/^[a-f0-9]{32}$/.test(raw.accountId) ||
			typeof credential !== "string" ||
			credential.length === 0 ||
			credential.length > 65536 ||
			!/^[A-Za-z0-9._~+/-]+=*$/.test(credential) ||
			credential.trim() !== credential
		) {
			this.#invalidate();
			throw new Error(
				"Development OIDC requires human OAuth credentials and an account."
			);
		}
		const auth: OAuthAccount = {
			accountId: raw.accountId,
			apiToken: { apiToken: credential },
		};
		signal.throwIfAborted();
		let state = this.#state;
		if (
			!state ||
			state.accountId !== auth.accountId ||
			state.credential !== credential ||
			(state.deadline !== undefined &&
				performance.now() + 300000 >= state.deadline)
		) {
			this.#invalidate();
			const controller = new AbortController();
			state = {
				accountId: auth.accountId,
				credential,
				controller,
				session: Promise.resolve(undefined as never),
			};
			this.#state = state;
			const current = state;
			state.session = this.#requests.run(
				async (requestSignal) => {
					const response = await this.#transport.createSession(
						auth,
						this.#workerName,
						this.#binding,
						requestSignal
					);
					const identity = snapshotDevelopmentOidcIdentity(response.identity);
					const remaining = response.expiresAt * 1000 - Date.now();
					if (
						identity.accountId !== auth.accountId ||
						response.binding !== this.#binding.binding ||
						response.defaultAudience !== this.#binding.audience ||
						!Number.isSafeInteger(response.expiresAt) ||
						remaining < 300000 ||
						remaining > 28800000
					)
						throw new Error(
							"Development OIDC returned an invalid session. Retry the getter."
						);
					current.deadline = performance.now() + remaining;
					return Object.freeze({ ...response, identity });
				},
				AbortSignal.any([controller.signal, this.#shutdown.signal])
			);
		}
		try {
			const session = await state.session;
			const current = AbortSignal.any([signal, state.controller.signal]);
			current.throwIfAborted();
			return await this.#requests.run(async (requestSignal) => {
				if (
					operation.operation === "fetch" &&
					operation.request &&
					!operation.grant
				)
					return this.#transport.dispatch(
						auth,
						session,
						operation.request,
						requestSignal
					);
				const result =
					operation.operation === "token" &&
					!operation.request &&
					!operation.grant
						? await this.#transport.issueToken(auth, session, requestSignal)
						: operation.operation === "grant" &&
							  operation.grant &&
							  !operation.request
							? await this.#transport.issueGrant(
									auth,
									session,
									operation.grant,
									requestSignal
								)
							: undefined;
				requestSignal.throwIfAborted();
				if (
					!result ||
					typeof result.token !== "string" ||
					result.token.length === 0 ||
					result.token.length > 65536 ||
					!Number.isSafeInteger(result.expiresAt) ||
					result.expiresAt * 1000 < Date.now() + 60000 ||
					result.expiresAt * 1000 > Date.now() + 300000 ||
					result.expiresAt > session.expiresAt
				)
					throw new Error(
						"Development OIDC returned an invalid assertion. Retry with a fresh call."
					);
				return new Response(result.token, {
					headers: {
						"Content-Type": "text/plain",
						"Cache-Control": "no-store",
					},
				});
			}, current);
		} catch (error) {
			if (this.#state === state) this.#invalidate();
			throw error;
		}
	}
	#invalidate() {
		const state = this.#state;
		this.#state = undefined;
		state?.controller.abort(
			new Error("Development OIDC session changed. Retry the call.")
		);
	}
	dispose() {
		this.#shutdown.abort(new Error("Development OIDC provider is disposed."));
		this.#invalidate();
	}
}
