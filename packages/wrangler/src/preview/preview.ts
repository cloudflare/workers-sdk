import { preview } from "@cloudflare/deploy-helpers";
import { getWranglerTmpDir } from "@cloudflare/workers-utils";
import { getAssetsOptions } from "../assets";
import { getNormalizedContainerOptions } from "../containers/config";
import { createCommand } from "../core/create-command";
import { getEntry } from "../deployment-bundle/entry";
import { buildWorker } from "../deployment-bundle/maybe-build-worker";
import { cleanupDestination } from "../deployment-bundle/merge-config-args";
import { writeOutput } from "../output";
import { requireAuth } from "../user";
import { deployPreviewContainers, verifyContainersScope } from "./containers";
import { ensurePreviewsConfig } from "./ensure-config";

export const previewCommand = createCommand({
	metadata: {
		description: "👀 Create a Preview deployment of the current Worker",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["script"],
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the Preview (defaults to current git branch)",
			type: "string",
			requiresArg: true,
		},
		tag: {
			describe: "A tag for this Preview deployment",
			type: "string",
			requiresArg: true,
		},
		message: {
			describe: "A descriptive message for this Preview deployment",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
		"ignore-base-config": {
			describe:
				"Only use settings from your config file, ignoring the Preview base config configured in the Cloudflare dashboard",
			type: "boolean",
			default: false,
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	behaviour: {
		useConfigRedirectIfAvailable: true,
		printBanner: (args) => args.json !== true,
		suggestSkillsAfterHandler: (args) => args.json !== true,
	},
	handler: async function previewHandler(args, { config }) {
		const accountId = await requireAuth(config);
		const previewConfig = await ensurePreviewsConfig(accountId, args, config);

		const entry = await getEntry(
			{ script: args.script },
			previewConfig,
			"deploy"
		);
		const destination = getWranglerTmpDir(entry.projectRoot, "preview");
		const buildResult = await buildWorker(
			{
				entry,
				name: previewConfig.name,
				compatibilityDate: previewConfig.compatibility_date,
				compatibilityFlags: previewConfig.compatibility_flags,
				uploadSourceMaps: previewConfig.upload_source_maps,
				jsxFactory: previewConfig.jsx_factory,
				jsxFragment: previewConfig.jsx_fragment,
				tsconfig: previewConfig.tsconfig,
				minify: previewConfig.minify,
				noBundle: previewConfig.no_bundle ?? false,
				defines: previewConfig.previews?.define ?? {},
				alias: { ...previewConfig.alias },
				doBindings: previewConfig.previews?.durable_objects?.bindings ?? [],
				workflowBindings: previewConfig.previews?.workflows ?? [],
				destination,
				outdir: undefined,
				metafile: undefined,
			},
			previewConfig
		);

		const assetsOptions = getAssetsOptions({
			args: { assets: undefined, script: args.script },
			config: previewConfig,
		});

		const { preview: previewResource, deployment } = await preview(
			accountId,
			args,
			previewConfig,
			buildResult,
			assetsOptions,
			{
				getNormalizedContainerOptions,
				deployPreviewContainers,
				verifyContainersScope,
			}
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
	},
});
