import lzstring from "lz-string";
import { TypedModule, Worker } from "./useDraftWorker";

// Parse a serialised FormData representation of a (very!) simple worker
// Importantly, this only supports a subset of worker config relevant to Playground workers
// JS and text modules, compat date and compat flags
async function parseSerialisedPlaygroundWorker(
	service: FormData
): Promise<Worker> {
	const metadataPart = service.get("metadata");
	let metadataJson: Record<string, string> = {};
	if (metadataPart && metadataPart instanceof File) {
		try {
			metadataJson = JSON.parse(await metadataPart.text());
		} catch {}
	}

	const worker = {
		metadata: {
			...(metadataJson?.compatibility_date && {
				compatibility_date: metadataJson.compatibility_date,
			}),
			...(metadataJson?.compatibility_flags && {
				compatibility_flags: metadataJson.compatibility_flags,
			}),
		},
	} as Worker;

	worker.entrypoint = metadataJson?.main_module ?? "index.js";
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
	const decompressed = lzstring.decompressFromEncodedURIComponent(hash);
	const colon = decompressed.indexOf(":");
	const contentType = decompressed.substring(0, colon);

	console.log(contentType, decompressed.substring(colon + 1));

	return parseSerialisedPlaygroundWorker(
		await deserializeFormData(decompressed.substring(colon + 1), contentType)
	);
}
