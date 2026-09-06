import { Miniflare } from "miniflare";
import { z } from "zod";
import { singleModuleManifest, useTmp } from "../../test-shared";
import type { ExpectStatic } from "vitest";

/** Creates a Local Explorer instance without configured storage bindings. */
export function createUnboundStorageExplorer(): Miniflare {
	return new Miniflare({
		inspectorPort: 0,
		unsafeLocalExplorer: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "worker",
					compatibilityDate: "2026-01-01",
					manifest: singleModuleManifest(
						`export default { fetch() { return new Response("worker"); } }`
					),
				},
			},
		],
	});
}

/** Creates two Local Explorer instances sharing the same storage owner. */
export async function createSharedStorageExplorerPair(): Promise<{
	owner: Miniflare;
	client: Miniflare;
}> {
	const resourcePersistencePath = await useTmp();
	const unsafeDevRegistryPath = await useTmp();
	async function createExplorer(name: string): Promise<Miniflare> {
		return new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeEnableSharedStorage: true,
			resourcePersistencePath,
			isolatedResourcePersistencePath: await useTmp(),
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						type: "worker",
						name,
						compatibilityDate: "2026-01-01",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("worker"); } }`
						),
					},
				},
			],
		});
	}

	const owner = await createExplorer("owner");
	await owner.ready;
	const client = await createExplorer("client");
	return { owner, client };
}

/**
 * Validates a response body against a Zod schema and returns typed data.
 * Throws a descriptive error if validation fails.
 */
export async function expectValidResponse<T extends z.ZodType>(
	response: Response,
	schema: T,
	expect: ExpectStatic,
	expectedStatus = 200
): Promise<z.infer<T>> {
	expect(response.status).toBe(expectedStatus);
	const json = await response.json();
	const result = schema.safeParse(json);

	if (!result.success) {
		throw new Error(
			`Response validation failed:\n${JSON.stringify(
				z.treeifyError(result.error),
				null,
				2
			)}\n\nActual response:\n${JSON.stringify(json, null, 2)}`
		);
	}

	return result.data;
}
