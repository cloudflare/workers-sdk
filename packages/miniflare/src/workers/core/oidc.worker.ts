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

	override async fetch(): Promise<Response> {
		return unsupported();
	}
}

export default { fetch: unsupported } satisfies ExportedHandler;
