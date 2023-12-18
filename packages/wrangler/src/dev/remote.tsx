import path from "node:path";
import { Text } from "ink";
import SelectInput from "ink-select-input";
import React, { useState, useEffect, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { helpIfErrorIsSizeOrScriptStartup } from "../deploy/deploy";
import { printBundleSize } from "../deployment-bundle/bundle-reporter";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { withSourceURLs } from "../deployment-bundle/source-url";
import { logger } from "../logger";
import { syncAssets } from "../sites";
import {
	getAccountChoices,
	requireApiToken,
	saveAccountToCache,
} from "../user";
import {
	createPreviewSession,
	createWorkerPreview,
} from "./create-worker-preview";
import type { ProxyData } from "../api";
import type { Route } from "../config/environment";
import type {
	CfModule,
	CfWorkerInit,
	CfScriptFormat,
	CfWorkerContext,
} from "../deployment-bundle/worker";
import type { AssetPaths } from "../sites";
import type { ChooseAccountItem } from "../user";
import type { CfAccount } from "./create-worker-preview";
import type { EsbuildBundle } from "./use-esbuild";

interface RemoteProps {
	name: string | undefined;
	bundle: EsbuildBundle | undefined;
	format: CfScriptFormat | undefined;
	isWorkersSite: boolean;
	assetPaths: AssetPaths | undefined;
	port: number;
	ip: string;
	localProtocol: "https" | "http";
	inspect: boolean;
	inspectorPort: number;
	accountId: string | undefined;
	bindings: CfWorkerInit["bindings"];
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	env: string | undefined;
	legacyEnv: boolean | undefined;
	zone: string | undefined;
	host: string | undefined;
	routes: Route[] | undefined;
	onReady?:
		| ((ip: string, port: number, proxyData: ProxyData) => void)
		| undefined;
	sourceMapPath: string | undefined;
	sendMetrics: boolean | undefined;

	setAccountId: (accountId: string) => void;
}

export function Remote(props: Pick<RemoteProps, "accountId" | "setAccountId">) {
	const [accountId, setAccountId] = useState(props.accountId);
	const accountChoicesRef = useRef<Promise<ChooseAccountItem[]>>();
	const [accountChoices, setAccountChoices] = useState<ChooseAccountItem[]>();

	const errorHandler = useErrorHandler();

	// This effect handles the async step of fetching the available accounts for the current user.
	// If only one account is available then it is just used by calling `setAccountId()`.
	useEffect(() => {
		if (
			accountChoicesRef.current !== undefined ||
			props.accountId !== undefined
		) {
			return;
		}
		accountChoicesRef.current = getAccountChoices();
		accountChoicesRef.current.then(
			(accounts) => {
				if (accounts.length === 1) {
					saveAccountToCache({
						id: accounts[0].id,
						name: accounts[0].name,
					});
					setAccountId(accounts[0].id);
				} else {
					setAccountChoices(accounts);
				}
			},
			(err) => {
				errorHandler(err);
			}
		);
	});

	// If we have not already chosen an account and there are multiple accounts available
	// allow the users to select one.
	return accountId === undefined && accountChoices !== undefined ? (
		<ChooseAccount
			accounts={accountChoices}
			onSelect={(selectedAccount) => {
				saveAccountToCache(selectedAccount);
				setAccountId(selectedAccount.id);
			}}
			onError={(err) => errorHandler(err)}
		></ChooseAccount>
	) : null;
}

export async function startRemoteServer(props: RemoteProps) {
	let accountId = props.accountId;
	if (accountId === undefined) {
		const accountChoices = await getAccountChoices();
		if (accountChoices.length === 1) {
			saveAccountToCache({
				id: accountChoices[0].id,
				name: accountChoices[0].name,
			});
			accountId = accountChoices[0].id;
		} else {
			throw logger.error(
				"In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as `account_id` in your `wrangler.toml` file."
			);
		}
	}

	return { stop() {} };
}

/**
 * getRemotePreviewToken is a react-free version of `useWorker`.
 * It returns a preview token, which we then use in our proxy server
 */
export async function getRemotePreviewToken(props: RemoteProps) {
	//setup the preview session
	async function start() {
		if (props.accountId === undefined) {
			throw logger.error("no accountId provided");
		}
		const abortController = new AbortController();
		const { workerAccount, workerContext } = getWorkerAccountAndContext({
			accountId: props.accountId,
			env: props.env,
			legacyEnv: props.legacyEnv,
			zone: props.zone,
			host: props.host,
			routes: props.routes,
			sendMetrics: props.sendMetrics,
		});
		const session = await createPreviewSession(
			workerAccount,
			workerContext,
			abortController.signal
		);
		//use the session to upload the worker, and create a preview

		if (session === undefined) {
			throw logger.error("Failed to start a session");
		}
		if (!props.bundle || !props.format) return;

		const init = await createRemoteWorkerInit({
			bundle: props.bundle,
			modules: props.bundle ? props.bundle.modules : [],
			accountId: props.accountId,
			name: props.name,
			legacyEnv: props.legacyEnv,
			env: props.env,
			isWorkersSite: props.isWorkersSite,
			assetPaths: props.assetPaths,
			format: props.format,
			bindings: props.bindings,
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
			usageModel: props.usageModel,
		});
		const workerPreviewToken = await createWorkerPreview(
			init,
			workerAccount,
			workerContext,
			session,
			abortController.signal
		);
		return workerPreviewToken;
	}
	return start().catch((err) => {
		if ((err as { code?: string })?.code !== "ABORT_ERR") {
			// instead of logging the raw API error to the user,
			// give them friendly instructions
			// for error 10063 (workers.dev subdomain required)
			if (err?.code === 10063) {
				const errorMessage =
					"Error: You need to register a workers.dev subdomain before running the dev command in remote mode";
				const solutionMessage =
					"You can either enable local mode by pressing l, or register a workers.dev subdomain here:";
				const onboardingLink = `https://dash.cloudflare.com/${props.accountId}/workers/onboarding`;
				logger.error(`${errorMessage}\n${solutionMessage}\n${onboardingLink}`);
			} else if (err?.code === 10049) {
				// code 10049 happens when the preview token expires
				logger.log("Preview token expired, restart server to fetch a new one");
			} else {
				helpIfErrorIsSizeOrScriptStartup(err, props.bundle?.dependencies || {});
				logger.error("Error on remote worker:", err);
			}
		}
	});
}

export async function createRemoteWorkerInit(props: {
	bundle: EsbuildBundle;
	modules: CfModule[];
	accountId: string;
	name: string | undefined;
	legacyEnv: boolean | undefined;
	env: string | undefined;
	isWorkersSite: boolean;
	assetPaths: AssetPaths | undefined;
	format: CfScriptFormat;
	bindings: CfWorkerInit["bindings"];
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
}) {
	const { entrypointSource: content, modules } = withSourceURLs(
		props.bundle.path,
		props.modules
	);

	// TODO: For Dev we could show the reporter message in the interactive box.
	void printBundleSize(
		{ name: path.basename(props.bundle.path), content: content },
		props.modules
	);

	const assets = await syncAssets(
		props.accountId,
		// When we're using the newer service environments, we wouldn't
		// have added the env name on to the script name. However, we must
		// include it in the kv namespace name regardless (since there's no
		// concept of service environments for kv namespaces yet).
		props.name + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
		props.isWorkersSite ? props.assetPaths : undefined,
		true,
		false,
		undefined
	); // TODO: cancellable?

	if (assets.manifest) {
		modules.push({
			name: "__STATIC_CONTENT_MANIFEST",
			filePath: undefined,
			content: JSON.stringify(assets.manifest),
			type: "text",
		});
	}

	const init: CfWorkerInit = {
		name: props.name,
		main: {
			name: path.basename(props.bundle.path),
			filePath: props.bundle.path,
			type: getBundleType(props.format),
			content,
		},
		modules,
		bindings: {
			...props.bindings,
			kv_namespaces: (props.bindings.kv_namespaces || []).concat(
				assets.namespace
					? { binding: "__STATIC_CONTENT", id: assets.namespace }
					: []
			),
			text_blobs: {
				...props.bindings.text_blobs,
				...(assets.manifest &&
					props.format === "service-worker" && {
						__STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
					}),
			},
		},
		migrations: undefined, // no migrations in dev
		compatibility_date: props.compatibilityDate,
		compatibility_flags: props.compatibilityFlags,
		usage_model: props.usageModel,
		keepVars: true,
		logpush: false,
		placement: undefined, // no placement in dev
		tail_consumers: undefined, // no tail consumers in dev - TODO revisit?
		limits: undefined, // no limits in preview - not supported yet but can be added
	};

	return init;
}

export function getWorkerAccountAndContext(props: {
	accountId: string;
	env?: string;
	legacyEnv?: boolean;
	zone?: string;
	host?: string;
	routes: Route[] | undefined;
	sendMetrics?: boolean;
}): { workerAccount: CfAccount; workerContext: CfWorkerContext } {
	const workerAccount: CfAccount = {
		accountId: props.accountId,
		apiToken: requireApiToken(),
	};

	const workerContext: CfWorkerContext = {
		env: props.env,
		legacyEnv: props.legacyEnv,
		zone: props.zone,
		host: props.host,
		routes: props.routes,
		sendMetrics: props.sendMetrics,
	};

	return { workerAccount, workerContext };
}

/**
 * A component that allows the user to select from a list of available accounts.
 */
function ChooseAccount(props: {
	accounts: ChooseAccountItem[];
	onSelect: (account: { name: string; id: string }) => void;
	onError: (error: Error) => void;
}) {
	return (
		<>
			<Text bold>Select an account from below:</Text>
			<SelectInput
				items={props.accounts.map((item) => ({
					key: item.id,
					label: item.name,
					value: item,
				}))}
				onSelect={(item) => {
					logger.log(`Using account: "${item.value.name} - ${item.value.id}"`);
					props.onSelect({ id: item.value.id, name: item.value.name });
				}}
			/>
		</>
	);
}
