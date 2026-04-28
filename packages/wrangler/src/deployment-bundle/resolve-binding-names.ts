import { UserError } from "@cloudflare/workers-utils";
import { getMTlsCertificateByName } from "../api/mtls-certificate";
import { listConfigs as listHyperdriveConfigs } from "../hyperdrive/client";
import { listKVNamespaces } from "../kv/helpers";
import { logger } from "../logger";
import { requireAuth } from "../user";
import type { Binding } from "../api/startDevWorker/types";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Resolves KV namespace bindings that use `kv_namespace` (name) instead of `id`.
 * Looks up each name via the API and replaces the `kv_namespace` field with `id`.
 */
export async function resolveKvNamespaceBindings(
	config: Config,
	bindings: Record<string, Binding>
): Promise<void> {
	const toResolve: { bindingName: string; kvName: string }[] = [];
	for (const [bindingName, binding] of Object.entries(bindings)) {
		if (binding.type === "kv_namespace" && !binding.id && binding.kv_namespace) {
			toResolve.push({ bindingName, kvName: binding.kv_namespace });
		}
	}

	if (toResolve.length === 0) {
		return;
	}

	const accountId = await requireAuth(config);
	const allNamespaces = await listKVNamespaces(config, accountId);

	for (const { bindingName, kvName } of toResolve) {
		const matches = allNamespaces.filter((ns) => ns.title === kvName);
		if (matches.length === 0) {
			throw new UserError(
				`KV namespace binding "${bindingName}": no namespace found with name "${kvName}". Use "wrangler kv namespace list" to see available namespaces.`
			);
		}
		if (matches.length > 1) {
			throw new UserError(
				`KV namespace binding "${bindingName}": multiple namespaces found with name "${kvName}". Use "id" instead to specify the exact namespace.`
			);
		}
		const binding = bindings[bindingName] as Extract<
			Binding,
			{ type: "kv_namespace" }
		>;
		logger.log(
			`Resolved KV namespace "${kvName}" to id "${matches[0].id}" for binding "${bindingName}".`
		);
		binding.id = matches[0].id;
		delete binding.kv_namespace;
	}
}

/**
 * Resolves Hyperdrive bindings that use `hyperdrive_name` instead of `id`.
 * Looks up each name via the API and replaces the `hyperdrive_name` field with `id`.
 */
export async function resolveHyperdriveBindings(
	config: Config,
	bindings: Record<string, Binding>
): Promise<void> {
	const toResolve: { bindingName: string; hyperdriveName: string }[] = [];
	for (const [bindingName, binding] of Object.entries(bindings)) {
		if (binding.type === "hyperdrive" && !binding.id && binding.hyperdrive_name) {
			toResolve.push({ bindingName, hyperdriveName: binding.hyperdrive_name });
		}
	}

	if (toResolve.length === 0) {
		return;
	}

	const allConfigs = await listHyperdriveConfigs(config);

	for (const { bindingName, hyperdriveName } of toResolve) {
		const matches = allConfigs.filter((c) => c.name === hyperdriveName);
		if (matches.length === 0) {
			throw new UserError(
				`Hyperdrive binding "${bindingName}": no config found with name "${hyperdriveName}". Use "wrangler hyperdrive list" to see available configs.`
			);
		}
		if (matches.length > 1) {
			throw new UserError(
				`Hyperdrive binding "${bindingName}": multiple configs found with name "${hyperdriveName}". Use "id" instead to specify the exact config.`
			);
		}
		const binding = bindings[bindingName] as Extract<
			Binding,
			{ type: "hyperdrive" }
		>;
		logger.log(
			`Resolved Hyperdrive config "${hyperdriveName}" to id "${matches[0].id}" for binding "${bindingName}".`
		);
		binding.id = matches[0].id;
		delete binding.hyperdrive_name;
	}
}

/**
 * Resolves mTLS certificate bindings that use `certificate_name` instead of `certificate_id`.
 * Looks up each name via the API and replaces the `certificate_name` field with `certificate_id`.
 */
export async function resolveMtlsCertificateBindings(
	config: Config,
	bindings: Record<string, Binding>
): Promise<void> {
	const toResolve: { bindingName: string; certName: string }[] = [];
	for (const [bindingName, binding] of Object.entries(bindings)) {
		if (
			binding.type === "mtls_certificate" &&
			!binding.certificate_id &&
			binding.certificate_name
		) {
			toResolve.push({ bindingName, certName: binding.certificate_name });
		}
	}

	if (toResolve.length === 0) {
		return;
	}

	const accountId = await requireAuth(config);

	for (const { bindingName, certName } of toResolve) {
		const cert = await getMTlsCertificateByName(config, accountId, certName);
		const binding = bindings[bindingName] as Extract<
			Binding,
			{ type: "mtls_certificate" }
		>;
		logger.log(
			`Resolved mTLS certificate "${certName}" to certificate_id "${cert.id}" for binding "${bindingName}".`
		);
		binding.certificate_id = cert.id;
		delete binding.certificate_name;
	}
}

/**
 * Resolves all binding name fields to their corresponding IDs.
 * Call this before creating the worker upload form.
 */
export async function resolveBindingNames(
	config: Config,
	bindings: Record<string, Binding>
): Promise<void> {
	await Promise.all([
		resolveKvNamespaceBindings(config, bindings),
		resolveHyperdriveBindings(config, bindings),
		resolveMtlsCertificateBindings(config, bindings),
	]);
}
