import { WorkerEntrypoint } from "cloudflare:workers";

function unsupported(): never {
	throw new Error(
		"Identity issuance is unavailable in local development. Use a deployed Preview or mock the binding in tests."
	);
}

export class IdentityBinding extends WorkerEntrypoint {
	async getToken(): Promise<string> {
		return unsupported();
	}

	async getAuthorizationGrant(): Promise<string> {
		return unsupported();
	}

	async getIdentity(): Promise<never> {
		return unsupported();
	}

	override async fetch(): Promise<Response> {
		throw new TypeError(
			"Use getIdentity().fetch() for signed requests. Identity issuance is unavailable in local development. Use a deployed Preview or mock the binding in tests."
		);
	}
}

export default { fetch: unsupported } satisfies ExportedHandler;
