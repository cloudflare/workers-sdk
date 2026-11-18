import { partitionExports } from "@cloudflare/workers-utils";
import { resolveDoLifecyclePayload } from "./durable";
import type { CfWorkerInit } from "@cloudflare/workers-utils";

// Tells the upload API that `workflow` exports carry their settings.
const WORKFLOW_EXPORTS_SCRIPT_API_DATE = "2026-11-09";

type ResolveExportsUploadPayloadProps = Parameters<
	typeof resolveDoLifecyclePayload
>[0];

export async function resolveExportsUploadPayload(
	props: ResolveExportsUploadPayloadProps
): Promise<{
	migrations: CfWorkerInit["migrations"];
	exports: CfWorkerInit["exports"];
	headers: Record<string, string> | undefined;
}> {
	const partitionedExports = partitionExports(props.config.exports);
	const { migrations, exports: durableObjectExports } =
		await resolveDoLifecyclePayload(props);
	// Durable Object exports replace migrations. Worker exports can upload with
	// either path, but not both.
	const exports: NonNullable<CfWorkerInit["exports"]> = {
		...partitionedExports.worker,
		...(durableObjectExports ?? {}),
		...partitionedExports.workflow,
	};

	return {
		migrations,
		exports: Object.keys(exports).length > 0 ? exports : undefined,
		headers:
			Object.keys(partitionedExports.workflow).length > 0
				? {
						"Cloudflare-Workers-Script-Api-Date":
							WORKFLOW_EXPORTS_SCRIPT_API_DATE,
					}
				: undefined,
	};
}
