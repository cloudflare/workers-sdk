import { assertNever } from "../assert-never";
import { UserError } from "../errors";
import { getBindingTypeFriendlyName } from "./validation";
import type { Binding } from "../types";

/**
 * Local-dev capability of each binding type. Source of truth for
 * `pickRemoteBindings()` and `validateBindingRemoteSetting()`.
 *
 * - `local-and-remote`: local simulator; `remote: true` opts into proxying.
 * - `local-default-with-remote-opt-in`: routes like `local-and-remote`, but
 *   warns when `remote` is omitted. Use it for bindings whose default changed
 *   from remote to local, so users who relied on the old default find out.
 * - `local-only`: local simulator only; `remote: true` is a config error.
 * - `remote`: no local simulator *yet* — requires explicit `remote: true`.
 *   Move to `local-and-remote` once a simulator lands.
 * - `DO-NOT-USE-this-resource-will-never-have-a-local-simulator`: no local
 *   simulator, *ever* — fundamentally remote-only. Always auto-routed; user
 *   is warned about usage charges. Adding here is permanent; prefer any
 *   other variant if a simulator is plausible.
 */
export type BindingLocalSupport =
	| "local-and-remote"
	| "local-default-with-remote-opt-in"
	| "local-only"
	| "remote"
	| "DO-NOT-USE-this-resource-will-never-have-a-local-simulator";

const BINDING_LOCAL_SUPPORT: Record<
	Exclude<Binding["type"], `unsafe_${string}`> | "unsafe_hello_world",
	BindingLocalSupport
> = {
	plain_text: "local-only",
	secret_text: "local-only",
	json: "local-only",
	wasm_module: "local-only",
	text_blob: "local-only",
	data_blob: "local-only",
	version_metadata: "local-only",
	inherit: "local-only",
	logfwdr: "local-only",
	assets: "local-only",
	unsafe_hello_world: "local-only",
	durable_object_namespace: "local-only",
	fetcher: "local-only",
	secrets_store_secret: "local-only",
	ratelimit: "local-only",
	worker_loader: "local-only",

	kv_namespace: "local-and-remote",
	r2_bucket: "local-and-remote",
	d1: "local-and-remote",
	hyperdrive: "local-and-remote",
	workflow: "local-only",
	browser: "local-and-remote",
	images: "local-and-remote",
	stream: "local-and-remote",
	send_email: "local-and-remote",
	pipeline: "local-and-remote",
	service: "local-and-remote",
	// TODO: Miniflare currently ignores `remote: true` on queues, tracked in #13727.
	queue: "local-and-remote",
	flagship: "local-and-remote",
	artifacts: "local-default-with-remote-opt-in",
	analytics_engine: "local-and-remote",

	vectorize: "remote",
	mtls_certificate: "remote",
	dispatch_namespace: "remote",

	// Reach out to the @cloudflare/wrangler team before adding anything here
	k2: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	ai: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	ai_search: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	ai_search_namespace:
		"DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	media: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	vpc_service: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	vpc_network: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	agent_memory: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
	analytics: "DO-NOT-USE-this-resource-will-never-have-a-local-simulator",
};

/**
 * What the deployed resource is called in remote-setting warnings, for binding
 * types where a more specific name reads better than "the deployed resource".
 */
const DEPLOYED_RESOURCE_NAMES: Partial<Record<Binding["type"], string>> = {
	artifacts: "deployed repos",
};

function getDeployedResourceName(type: Binding["type"]): string {
	return DEPLOYED_RESOURCE_NAMES[type] ?? "the deployed resource";
}

export function getBindingLocalSupport(
	type: Binding["type"]
): BindingLocalSupport {
	if (type in BINDING_LOCAL_SUPPORT) {
		return BINDING_LOCAL_SUPPORT[type as keyof typeof BINDING_LOCAL_SUPPORT];
	}
	return "local-only";
}

/**
 * Resolves whether a binding uses the deployed resource during local
 * development. This is the single source of truth for routing a binding to a
 * remote proxy session and for labelling it in the bindings table.
 *
 * @param type - Binding type
 * @param remote - The binding's configured `remote` setting
 * @param options.remoteBindingsDisabled - Whether the dev session runs without
 * remote bindings, as with `wrangler dev --local`
 * @returns Whether the binding uses the deployed resource. Bindings that will
 * never have a local simulator always return `true`, even when remote bindings
 * are disabled and the binding is therefore unavailable.
 */
export function resolveBindingRemote(
	type: Binding["type"],
	remote: boolean | undefined,
	{ remoteBindingsDisabled = false }: { remoteBindingsDisabled?: boolean } = {}
): boolean {
	const support = getBindingLocalSupport(type);
	switch (support) {
		case "DO-NOT-USE-this-resource-will-never-have-a-local-simulator":
			return true;
		case "local-only":
			return false;
		case "local-and-remote":
		case "local-default-with-remote-opt-in":
		case "remote":
			return !remoteBindingsDisabled && remote === true;
	}
}

/**
 * Validates the user's `remote` setting for a given binding against the
 * binding type's local-development capabilities. Throws `UserError` for
 * invalid combinations and uses the caller-provided logger for
 * valid-but-noteworthy ones.
 *
 * @param options.binding - Binding name, used to identify the binding in warnings
 * @param options.configFormat - Which config format the binding came from, so
 * warnings name the setting the user can write: `remote` in a Wrangler config,
 * `dev: { remote }` in `cloudflare.config.ts`. Defaults to `"wrangler"`.
 */
export function validateBindingRemoteSetting(
	type: Binding["type"],
	remote: boolean | undefined,
	warn: (message: string) => void,
	{
		binding,
		configFormat = "wrangler",
	}: {
		binding?: string;
		configFormat?: "wrangler" | "cloudflare-config";
	} = {}
) {
	const remoteSetting = (value: boolean) =>
		configFormat === "cloudflare-config"
			? `\`dev: { remote: ${value} }\``
			: `\`remote: ${value}\``;
	const support = getBindingLocalSupport(type);
	switch (support) {
		case "local-and-remote":
			return;
		case "local-default-with-remote-opt-in":
			// The default used to be the deployed resource. Say so until the user
			// picks one, so nobody silently loses access to their real data.
			if (remote === undefined) {
				const subject =
					binding === undefined
						? `${getBindingTypeFriendlyName(type)} bindings use`
						: `${getBindingTypeFriendlyName(type)} binding ${binding} uses`;
				warn(
					`${subject} the local simulator by default. Set ${remoteSetting(true)} to use ${getDeployedResourceName(type)}, or ${remoteSetting(false)} to silence this warning.`
				);
			}
			return;
		case "local-only":
			if (remote === true) {
				throw new UserError(
					`${getBindingTypeFriendlyName(type)} bindings do not support accessing remote resources.`,
					{
						telemetryMessage: "utils bindings unsupported remote resources",
					}
				);
			}
			return;
		case "remote":
			if (remote === false) {
				throw new UserError(
					`${getBindingTypeFriendlyName(type)} bindings do not support local development. You can set \`remote: true\` for the binding definition in your configuration file to access a remote version of the resource.`,
					{
						telemetryMessage: "utils bindings unsupported local development",
					}
				);
			}
			if (remote === undefined) {
				warn(
					`${getBindingTypeFriendlyName(type)} bindings do not support local development, and so parts of your Worker may not work correctly. You can set \`remote: true\` for the binding definition in your configuration file to access a remote version of the resource.`
				);
			}
			return;
		case "DO-NOT-USE-this-resource-will-never-have-a-local-simulator":
			if (remote === false) {
				throw new UserError(
					`${getBindingTypeFriendlyName(type)} bindings do not support local development. You can set \`remote: true\` for the binding definition in your configuration file to access a remote version of the resource.`,
					{
						telemetryMessage:
							"utils bindings unsupported local development always remote",
					}
				);
			}
			if (remote === undefined) {
				warn(
					`${getBindingTypeFriendlyName(type)} bindings always access remote resources, and so may incur usage charges even in local dev. To suppress this warning, set \`remote: true\` for the binding definition in your configuration file.`
				);
			}
			return;
		default:
			assertNever(support);
	}
}
