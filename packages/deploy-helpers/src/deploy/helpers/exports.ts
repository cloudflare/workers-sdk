import { partitionExports } from "@cloudflare/workers-utils";
import { resolveDoLifecyclePayload } from "./durable";
import type { CfWorkerInit } from "@cloudflare/workers-utils";

type ResolveExportsUploadPayloadProps = Parameters<
	typeof resolveDoLifecyclePayload
>[0];

export async function resolveExportsUploadPayload(
	props: ResolveExportsUploadPayloadProps
): Promise<{
	migrations: CfWorkerInit["migrations"];
	exports: CfWorkerInit["exports"];
}> {
	const partitionedExports = partitionExports(props.config.exports);
	const { migrations, exports: durableObjectExports } =
		await resolveDoLifecyclePayload(props);
	// Durable Object exports replace migrations. Worker exports can upload with
	// either path, but not both.
	const exports: NonNullable<CfWorkerInit["exports"]> = {
		...partitionedExports.worker,
		...(durableObjectExports ?? {}),
	};
	// Workflow limits are applied when `triggers deploy` provisions the
	// Workflow; the upload API only accepts the name.
	for (const [className, { name }] of Object.entries(
		partitionedExports.workflow
	)) {
		exports[className] = { type: "workflow", name };
	}

	return {
		migrations,
		exports: Object.keys(exports).length > 0 ? exports : undefined,
	};
}
