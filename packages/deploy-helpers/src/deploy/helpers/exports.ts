import { partitionExports } from "@cloudflare/workers-utils";
import { resolveDoLifecyclePayload } from "./durable";
import type { CfWorkerInit } from "@cloudflare/workers-utils";

/**
 * Sent as `Cloudflare-Workers-Script-Api-Date` on Worker uploads so EWC knows
 * Workflow exports carry their settings and can provision them.
 */
export const WORKER_UPLOAD_SCRIPT_API_DATE = "2026-10-22";

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
		// EWC provisions Workflow exports from these settings. `triggers deploy`
		// still PUTs the same settings to the Workflows API, which dedupes them.
		...Object.fromEntries(
			Object.entries(partitionedExports.workflow).map(
				([
					className,
					{
						name,
						limits,
						concurrency,
						schedules,
						default_retention,
						jurisdiction,
					},
				]) =>
					[
						className,
						{
							type: "workflow",
							name,
							...(limits && { limits }),
							...(concurrency && { concurrency }),
							...(schedules && { schedules }),
							...(default_retention && { default_retention }),
							...(jurisdiction && { jurisdiction }),
						},
					] as const
			)
		),
	};

	return {
		migrations,
		exports: Object.keys(exports).length > 0 ? exports : undefined,
	};
}
