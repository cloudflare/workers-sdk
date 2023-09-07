import { Worker, TypedModule } from "./useDraftWorker";
import lzstring from "lz-string";

// Parse a serialised FormData representation of a (very!) simple worker
// Importantly, this only supports a subset of worker config relevant to Playground workers
// JS and text modules, compat date and compat flags
async function parseSerialisedPlaygroundWorker(
	service: FormData
): Promise<Worker> {
	const metadataPart = JSON.parse(
		await (service.get("metadata") as File).text()
	) as Record<string, string>;

	const worker = {
		metadata: {
			...(metadataPart?.compatibility_date && {
				compatibility_date: metadataPart.compatibility_date,
			}),
			...(metadataPart?.compatibility_flags && {
				compatibility_flags: metadataPart.compatibility_flags,
			}),
		},
	} as Worker;

	worker.entrypoint = metadataPart.main_module;
	worker.modules = Object.fromEntries(
		await Promise.all(
			[...service.entries()]
				.filter(
					([name, file]) =>
						name !== "metadata" &&
						typeof file !== "string" &&
						[
							"application/javascript",
							"application/javascript+module",
							"text/plain",
						].includes(file.type)
				)
				.map(async ([name, file]) => [
					name,
					{
						contents: new Uint8Array(await (file as File).arrayBuffer()),
						type: (file as File).type,
					} as TypedModule,
				])
		)
	);

	return worker;
}
async function deserializeFormData(content: string, contentType: string) {
	const res = new Response(content);
	res.headers.set("content-type", contentType);

	return await res.formData();
}
export async function getPlaygroundWorker(hash: string) {
	const [contentType, ...content] = lzstring
		.decompressFromEncodedURIComponent(hash)
		.split(":");

	return parseSerialisedPlaygroundWorker(
		await deserializeFormData(content.join(":"), contentType)
	);
}
