import { partitionExports } from "@cloudflare/workers-utils";
import { resolveDoLifecyclePayload } from "./durable";
import {
	formatWorkflowUploadSettings,
	getWorkflowsOwnedByScript,
} from "./owned-workflows";
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
		...Object.fromEntries(
			getWorkflowsOwnedByScript(props.config, props.scriptName)
				.filter(
					({ name, class_name }) =>
						partitionedExports.workflow[class_name]?.name === name
				)
				.map((workflow) => [
					workflow.class_name,
					{
						type: "workflow",
						name: workflow.name,
						class_name: workflow.class_name,
						...formatWorkflowUploadSettings(workflow),
					},
				])
		),
	};

	return {
		migrations,
		exports: Object.keys(exports).length > 0 ? exports : undefined,
	};
}
