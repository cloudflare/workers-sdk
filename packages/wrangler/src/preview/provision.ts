import { APIError } from "@cloudflare/workers-utils";
import { autoProvisionedResourceName } from "../deployment-bundle/auto-provisioned-name";
import { getFlag } from "../experimental-flags";
import {
	createKVNamespace,
	deleteKVNamespace,
	listKVNamespaces,
} from "../kv/helpers";
import {
	createR2Bucket,
	deleteR2Bucket,
	getR2Bucket,
} from "../r2/helpers/bucket";
import { deleteR2Object, listR2ObjectKeys } from "../r2/helpers/object";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

function getPreviewResourceName(
	workerName: string,
	previewSlug: string,
	bindingName: string
): string {
	return autoProvisionedResourceName(
		`${workerName}-${previewSlug}`,
		bindingName
	);
}

function isNotFoundError(error: unknown): boolean {
	return (
		error instanceof APIError &&
		(error.status === 404 || error.code === 10006 || error.code === 10025)
	);
}

export function getFallbackPreviewSlug(previewName: string): string {
	return previewName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function hasPreviewBindingsToProvision(config: Config): boolean {
	const previews = config.previews as PreviewsConfig | undefined;
	return !!(
		previews?.kv_namespaces?.some((kv) => !kv.id) ||
		previews?.r2_buckets?.some((r2) => !r2.bucket_name)
	);
}

export async function provisionPreviewBindings(
	config: Config,
	accountId: string,
	workerName: string,
	previewSlug: string
): Promise<Config> {
	if (!getFlag("RESOURCES_PROVISION")) {
		return config;
	}

	const previews = config.previews as PreviewsConfig | undefined;
	if (!previews || !hasPreviewBindingsToProvision(config)) {
		return config;
	}

	let changed = false;
	const kvNamespaces = await Promise.all(
		(previews.kv_namespaces ?? []).map(async (kv) => {
			if (kv.id) {
				return kv;
			}

			const title = getPreviewResourceName(workerName, previewSlug, kv.binding);
			const existing = (await listKVNamespaces(config, accountId)).find(
				(namespace) => namespace.title === title
			);
			const id =
				existing?.id ?? (await createKVNamespace(config, accountId, title));
			changed = true;
			return { ...kv, id };
		})
	);

	const r2Buckets = await Promise.all(
		(previews.r2_buckets ?? []).map(async (r2) => {
			if (r2.bucket_name) {
				return r2;
			}

			const bucketName = getPreviewResourceName(
				workerName,
				previewSlug,
				r2.binding
			);
			try {
				await getR2Bucket(config, accountId, bucketName, r2.jurisdiction);
			} catch (error) {
				if (!isNotFoundError(error)) {
					throw error;
				}
				await createR2Bucket(
					config,
					accountId,
					bucketName,
					undefined,
					r2.jurisdiction
				);
			}

			changed = true;
			return { ...r2, bucket_name: bucketName };
		})
	);

	if (!changed) {
		return config;
	}

	return {
		...config,
		previews: {
			...previews,
			kv_namespaces: kvNamespaces,
			r2_buckets: r2Buckets,
		},
	};
}

export async function cleanupPreviewBindings(
	config: Config,
	accountId: string,
	workerName: string,
	previewSlug: string
): Promise<void> {
	if (!getFlag("RESOURCES_PROVISION")) {
		return;
	}

	const previews = config.previews as PreviewsConfig | undefined;
	if (!previews || !hasPreviewBindingsToProvision(config)) {
		return;
	}

	for (const kv of previews.kv_namespaces ?? []) {
		if (kv.id) {
			continue;
		}

		const title = getPreviewResourceName(workerName, previewSlug, kv.binding);
		const namespace = (await listKVNamespaces(config, accountId)).find(
			(namespace) => namespace.title === title
		);
		if (!namespace) {
			continue;
		}

		try {
			await deleteKVNamespace(config, accountId, namespace.id);
		} catch (error) {
			if (!isNotFoundError(error)) {
				throw error;
			}
		}
	}

	for (const r2 of previews.r2_buckets ?? []) {
		if (r2.bucket_name) {
			continue;
		}

		const bucketName = getPreviewResourceName(
			workerName,
			previewSlug,
			r2.binding
		);

		try {
			await getR2Bucket(config, accountId, bucketName, r2.jurisdiction);
		} catch (error) {
			if (isNotFoundError(error)) {
				continue;
			}
			throw error;
		}

		for (const key of await listR2ObjectKeys(
			config,
			accountId,
			bucketName,
			r2.jurisdiction
		)) {
			await deleteR2Object(
				config,
				accountId,
				bucketName,
				key,
				true,
				r2.jurisdiction
			);
		}

		try {
			await deleteR2Bucket(config, accountId, bucketName, r2.jurisdiction);
		} catch (error) {
			if (!isNotFoundError(error)) {
				throw error;
			}
		}
	}
}
