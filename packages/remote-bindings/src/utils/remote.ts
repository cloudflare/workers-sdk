import assert from "node:assert";
import path from "node:path";
import { getAuthFromEnv } from "@cloudflare/workers-auth";
import { APIError, UserError } from "@cloudflare/workers-utils";
import { logger } from "../logger";
import { isAbortError } from "./isAbortError";
import type { CfAccount } from "./create-worker-preview";
import type { EsbuildBundle } from "./use-esbuild";
import type {
	ApiCredentials,
	CfWorkerContext,
	CfWorkerInit,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";

/**
 * Error thrown when a remote dev session fails due to an authentication
 * problem.  The error message is a user-friendly description with actionable
 * guidance, tailored to the caller's authentication method (environment
 * variable token vs. OAuth).  The original API error is preserved as the
 * error's {@link Error.cause | cause}.
 *
 * Consumers that catch this error can display {@link Error.message | message}
 * directly — no additional logging helper is needed.
 */
export class RemoteSessionAuthenticationError extends UserError {
	/**
	 * @param cause - The original error that triggered the authentication
	 *   failure (e.g. an {@link APIError} with code 9106 or 10000).
	 */
	constructor(cause: unknown) {
		const envAuth = getAuthFromEnv();

		let errorMessage =
			"Failed to establish remote session due to an authentication issue.\n";
		if (envAuth !== undefined) {
			// The user is authenticating via an environment variable
			const method =
				"apiToken" in envAuth
					? "a custom API token (`CLOUDFLARE_API_TOKEN`)"
					: "a Global API Key (`CLOUDFLARE_API_KEY`)";

			errorMessage +=
				`It looks like you are authenticating via ${method} set in an environment variable.\n` +
				"The token may be invalid or lack the required permissions for this operation.\n\n" +
				"To fix this, verify that your token is valid and has the correct permissions.\n" +
				"You can also run `wrangler whoami` to check your current authentication status.";
		} else {
			// The user is authenticating via OAuth (wrangler login)
			errorMessage +=
				"Your credentials may have expired or been revoked.\n\n" +
				"To fix this, try to:\n" +
				"  - Run `wrangler whoami` to check your current authentication status.\n" +
				"  - Run `wrangler logout` and then `wrangler login` to re-authenticate.";
		}

		super(errorMessage, {
			cause,
			telemetryMessage: "remote dev authentication error",
		});
	}
}

export function handlePreviewSessionUploadError(
	err: unknown,
	accountId: string
): boolean {
	assert(err && typeof err === "object");
	// we want to log the error, but not end the process
	// since it could recover after the developer fixes whatever's wrong
	// instead of logging the raw API error to the user,
	// give them friendly instructions
	if (!isAbortError(err)) {
		// code 10049 happens when the preview token expires
		if ("code" in err && err.code === 10049) {
			logger.log("Preview token expired, fetching a new one");

			// since we want a new preview token when this happens,
			// lets increment the counter, and trigger a rerun of
			// the useEffect above
			return true;
		} else if (!handleUserFriendlyError(err, accountId)) {
			logger.error("Error on remote worker:", err);
		}
	}
	return false;
}

export function handlePreviewSessionCreationError(
	err: unknown,
	accountId: string
) {
	assert(err && typeof err === "object");
	if (handleUserFriendlyError(err, accountId)) {
		return;
	}
	if (
		"cause" in err &&
		(err.cause as { code: string; hostname: string })?.code === "ENOTFOUND"
	) {
		logger.error(
			`Could not access \`${(err.cause as { code: string; hostname: string }).hostname}\`. Make sure the domain is set up to be proxied by Cloudflare.\nFor more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route`
		);
	} else if (err instanceof UserError) {
		logger.error(err.message);
	}
	// we want to log the error, but not end the process
	// since it could recover after the developer fixes whatever's wrong
	else if (!isAbortError(err)) {
		logger.error("Error while creating remote dev session:", err);
	}
}

export type CfWorkerInitWithName = Required<Pick<CfWorkerInit, "name">> &
	Omit<CfWorkerInit, "bindings"> & {
		bindings: StartDevWorkerInput["bindings"];
	};

/**
 * Create remote worker init from StartDevWorkerInput["bindings"] format
 * (flat Record<string, Binding>).
 */
export function createRemoteWorkerInit(props: {
	bundle: EsbuildBundle;
	name: string;
	bindings: StartDevWorkerInput["bindings"];
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
}) {
	const bindings = { ...props.bindings };

	const init: CfWorkerInitWithName = {
		name: props.name,
		main: {
			name: path.basename(props.bundle.path),
			filePath: props.bundle.path,
			type: props.bundle.type,
			content: props.bundle.entrypointSource,
		},
		modules: props.bundle.modules,
		bindings,
		migrations: undefined, // no migrations in dev
		exports: undefined,
		compatibility_date: props.compatibilityDate,
		compatibility_flags: props.compatibilityFlags,
		keepVars: true,
		keepSecrets: true,
		logpush: false,
		sourceMaps: undefined,
		containers: undefined, // Containers are not supported in remote dev mode
		assets: undefined,
		placement: undefined, // no placement in dev
		tail_consumers: undefined,
		streaming_tail_consumers: undefined,
		limits: undefined, // no limits in preview - not supported yet but can be added
		observability: undefined, // no observability in dev,
		cache: undefined, // no cache in dev
	};

	return init;
}

export function getWorkerAccountAndContext(props: {
	accountId: string;
	apiToken: ApiCredentials;
}): { workerAccount: CfAccount; workerContext: CfWorkerContext } {
	const workerAccount: CfAccount = {
		accountId: props.accountId,
		apiToken: props.apiToken,
	};

	const workerContext: CfWorkerContext = {
		env: undefined,
		zone: undefined,
		host: undefined,
		routes: undefined,
		sendMetrics: undefined,
	};

	return { workerAccount, workerContext };
}

/**
 * A switch for handling thrown error mappings to user friendly
 * messages, does not perform any logic other than logging errors.
 * @returns if the error was handled or not
 */
function handleUserFriendlyError(error: unknown, accountId?: string) {
	if (error instanceof APIError) {
		switch (error.code) {
			// code 9106 and 10000 are authentication errors
			case 9106:
			case 10000: {
				throw new RemoteSessionAuthenticationError(error);
			}

			// for error 10063 (workers.dev subdomain required)
			case 10063: {
				const onboardingLink = accountId
					? `https://dash.cloudflare.com/${accountId}/workers/onboarding`
					: "https://dash.cloudflare.com/?to=/:account/workers/onboarding";

				logger.error(
					`You need to register a workers.dev subdomain before running the dev command in remote mode. You can either enable local mode by pressing l, or register a workers.dev subdomain here: ${onboardingLink}`
				);

				return true;
			}

			default: {
				logger.error(error);
				return true;
			}
		}
	}
}
