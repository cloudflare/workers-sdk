import { preview, previewDelete } from "@cloudflare/deploy-helpers";
import { getWranglerTmpDir } from "@cloudflare/workers-utils";
import { getAssetsOptions } from "../assets";
import { getEntry } from "../deployment-bundle/entry";
import { buildWorker } from "../deployment-bundle/maybe-build-worker";
import { cleanupDestination } from "../deployment-bundle/merge-config-args";
import { writeOutput } from "../output";
import { requireAuth } from "../user";
import type { Config } from "@cloudflare/workers-utils";

export async function handlePreviewCommand(
	args: {
		script?: string;
		name?: string;
		tag?: string;
		message?: string;
		json?: boolean;
		ignoreDefaults: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const accountId = await requireAuth(config);

	const entry = await getEntry({ script: args.script }, config, "deploy");
	const destination = getWranglerTmpDir(entry.projectRoot, "preview");
	const buildResult = await buildWorker(
		{
			entry,
			name: config.name,
			compatibilityDate: config.compatibility_date,
			compatibilityFlags: config.compatibility_flags,
			uploadSourceMaps: config.upload_source_maps,
			jsxFactory: config.jsx_factory,
			jsxFragment: config.jsx_fragment,
			tsconfig: config.tsconfig,
			minify: config.minify,
			noBundle: config.no_bundle ?? false,
			defines: config.previews?.define ?? {},
			alias: { ...config.alias },
			doBindings: config.previews?.durable_objects?.bindings ?? [],
			workflowBindings: config.previews?.workflows ?? [],
			destination,
			outdir: undefined,
			metafile: undefined,
		},
		config
	);

	const assetsOptions = getAssetsOptions({
		args: { assets: undefined, script: args.script },
		config,
	});

	const { preview: previewResource, deployment } = await preview(
		accountId,
		args,
		config,
		buildResult,
		assetsOptions
	);
	cleanupDestination(destination);

	writeOutput({
		type: "preview",
		version: 1,
		worker_name: previewResource.worker_name,
		preview_id: previewResource.id,
		preview_name: previewResource.name,
		preview_slug: previewResource.slug,
		preview_urls: previewResource.urls,
		deployment_id: deployment.id,
		deployment_urls: deployment.urls,
	});
}

export async function handlePreviewDeleteCommand(
	args: {
		name?: string;
		skipConfirmation?: boolean;
		workerName?: string;
		"worker-name"?: string;
	},
	{ config }: { config: Config }
) {
	const accountId = await requireAuth(config);
	await previewDelete(accountId, args, config);
}
