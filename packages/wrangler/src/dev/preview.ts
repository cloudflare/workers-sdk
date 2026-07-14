import { getWorkersDevSubdomain } from "@cloudflare/deploy-helpers";
import {
	createPreviewSession as createPreviewSessionWithContext,
	createWorkerPreview as createWorkerPreviewWithContext,
} from "@cloudflare/remote-bindings/preview/create-worker-preview";
import { fetch } from "undici";
import { fetchResult } from "../cfetch";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { logger } from "../logger";
import { getAccessHeaders } from "../user/access";
import type {
	CfAccount,
	CfPreviewSession,
	CfPreviewToken,
	CfWorkerInitWithName,
	CreateWorkerPreviewOptions,
} from "@cloudflare/remote-bindings/preview/create-worker-preview";
import type {
	CfWorkerContext,
	ComplianceConfig,
} from "@cloudflare/workers-utils";

export type { CfAccount, CfPreviewSession, CfPreviewToken };

const options: CreateWorkerPreviewOptions = {
	context: {
		fetch,
		fetchResult,
		createWorkerUploadForm,
		getWorkersDevSubdomain,
		getAccessHeaders,
		logger,
	},
};

export function createPreviewSession(
	complianceConfig: ComplianceConfig,
	account: CfAccount,
	context: CfWorkerContext,
	abortSignal: AbortSignal,
	name: string | undefined
): Promise<CfPreviewSession> {
	return createPreviewSessionWithContext(
		complianceConfig,
		account,
		context,
		abortSignal,
		name,
		options
	);
}

export function createWorkerPreview(
	complianceConfig: ComplianceConfig,
	init: CfWorkerInitWithName,
	account: CfAccount,
	context: CfWorkerContext,
	session: CfPreviewSession,
	abortSignal: AbortSignal,
	minimalMode?: boolean
): Promise<CfPreviewToken> {
	return createWorkerPreviewWithContext(
		complianceConfig,
		init,
		account,
		context,
		session,
		abortSignal,
		minimalMode,
		options
	);
}
