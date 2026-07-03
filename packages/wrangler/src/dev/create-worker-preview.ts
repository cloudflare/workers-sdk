import {
	createPreviewSession as createPreviewSessionImpl,
	createWorkerPreview as createWorkerPreviewImpl,
} from "@cloudflare/remote-bindings";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import type {
	CfAccount,
	CfPreviewSession,
	CfPreviewToken,
} from "@cloudflare/remote-bindings";
import type {
	CfWorkerContext,
	CfWorkerInitWithName,
	ComplianceConfig,
} from "@cloudflare/workers-utils";

export type { CfAccount, CfPreviewSession, CfPreviewToken };

/**
 * The edge-preview session/token creation lives in `@cloudflare/remote-bindings`
 * so it can be shared with the standalone remote-proxy path (and consumers like
 * the Vite plugin) without depending on wrangler. These thin wrappers inject
 * wrangler's `logger` singleton — which sanitises secrets from debug output —
 * so existing call sites (e.g. {@link RemoteRuntimeController}) are unchanged.
 */
export function createPreviewSession(
	complianceConfig: ComplianceConfig,
	account: CfAccount,
	ctx: CfWorkerContext,
	abortSignal: AbortSignal,
	name: string | undefined
): Promise<CfPreviewSession> {
	return createPreviewSessionImpl(
		complianceConfig,
		account,
		ctx,
		abortSignal,
		name,
		{ logger, isNonInteractiveOrCI }
	);
}

export function createWorkerPreview(
	complianceConfig: ComplianceConfig,
	init: CfWorkerInitWithName,
	account: CfAccount,
	ctx: CfWorkerContext,
	session: CfPreviewSession,
	abortSignal: AbortSignal,
	minimal_mode?: boolean
): Promise<CfPreviewToken> {
	return createWorkerPreviewImpl(
		complianceConfig,
		init,
		account,
		ctx,
		session,
		abortSignal,
		minimal_mode,
		{ logger }
	);
}
