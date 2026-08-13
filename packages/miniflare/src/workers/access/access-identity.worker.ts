// Access identity binding worker for local dev.
//
// In production, workerd dispatches `ctx.access.getIdentity()` to an Access
// binding worker via JS-RPC, passing `{ aud, jwtClaims }` as `ctx.props`.
// This embedded worker mirrors that interface: it receives `ctx.props` from
// workerd and returns the `jwtClaims` value as the identity.

import { WorkerEntrypoint } from "cloudflare:workers";

interface Props {
	aud: string;
	jwtClaims?: Record<string, unknown>;
}

export default class AccessIdentityBinding extends WorkerEntrypoint<
	Record<string, never>,
	Props
> {
	async getIdentity(): Promise<Record<string, unknown> | undefined> {
		return this.ctx.props.jwtClaims;
	}
}
