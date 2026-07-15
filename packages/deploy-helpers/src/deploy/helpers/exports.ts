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
	// either path, but not both. Workflow exports are provisioned through the
	// Workflows API after the Worker module is uploaded; the Worker upload API
	// does not accept `workflow` entries in its `exports` metadata.
	const exports = {
		...partitionedExports.worker,
		...(durableObjectExports ?? {}),
	};

	return {
		migrations,
		exports: Object.keys(exports).length > 0 ? exports : undefined,
	};
}
