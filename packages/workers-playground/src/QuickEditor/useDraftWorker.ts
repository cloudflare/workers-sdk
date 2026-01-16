import { eg } from "@cloudflare/util-en-garde";
import lzstring from "lz-string";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { v4 } from "uuid";
import { getPlaygroundWorker } from "./getPlaygroundWorker";
import { matchFiles, parseRules, toMimeType } from "./module-collection";
import type { TypeFromCodec } from "@cloudflare/util-en-garde";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
export const DeployPlaygroundWorkerResponse = eg.union([
	eg.object({
		inspector: eg.string,
		preview: eg.string,
		tail: eg.string,
	}),
	eg.object({
		error: eg.string,
		message: eg.string,
	}),
]);

export const PreviewAPIErrorCodec = eg.array(
	eg.object({
		message: eg.string,
		code: eg.number,
	})
);

export type PreviewAPIError = TypeFromCodec<
	typeof PreviewAPIErrorCodec
>[number];

interface WorkerUploadMetadata {
	compatibility_date?: string;
	compatibility_flags?: string[];
	main_module: string;
}

interface WorkerMetadata {
	compatibility_date?: string;
	compatibility_flags?: string[];
}

export interface TypedModule {
	contents: Uint8Array;
	type: string | undefined;
}

export interface Worker {
	entrypoint: string;
	metadata: WorkerMetadata;
	modules: Record<string, TypedModule>;
}

interface PartialWorker extends Omit<Worker, "metadata"> {
	metadata?: Partial<WorkerMetadata>;
}

export function serialiseWorker(service: PartialWorker): FormData {
	const formData = new FormData();

	const metadata: WorkerUploadMetadata = {
		...(service?.metadata?.compatibility_date && {
			compatibility_date: service.metadata.compatibility_date,
		}),
		...(service?.metadata?.compatibility_flags && {
			compatibility_flags: service.metadata.compatibility_flags,
		}),
		main_module: service.entrypoint,
	};

	const typedModules = matchFiles(service.modules, parseRules([]));

	const entrypointModule = typedModules.find(
		(m) => m.name === service.entrypoint
	);
	for (const { name, content, type } of typedModules) {
		formData.set(
			name,
			new Blob([content.contents], {
				type: content.type ?? toMimeType(type ?? "esm"),
			}),
			name
		);
	}

	formData.set(
		"metadata",
		new Blob([JSON.stringify(metadata)], { type: "application/json" })
	);

	return formData;
}

export type PreviewHash = {
	previewUrl: string;
	devtoolsUrl: string;
	serialised: string;
};

export async function compressTextWorker(contentType: string, worker: string) {
	return lzstring.compressToEncodedURIComponent(`${contentType}:${worker}`);
}

export async function compressWorker(worker: FormData) {
	const serialisedWorker = new Response(worker);
	return compressTextWorker(
		serialisedWorker.headers.get("content-type") ?? "",
		await serialisedWorker.text()
	);
}

async function updatePreviewHash(content: Worker): Promise<PreviewHash> {
	const worker = serialiseWorker(content);
	const serialised = await compressWorker(worker);

	const res = await fetch("/playground/api/worker", {
		method: "POST",
		body: worker,
	});
	const data = await res.json();
	const deploy = DeployPlaygroundWorkerResponse.assertDecode(data);

	if ("error" in deploy) {
		throw new Error(deploy.message);
	}

	return {
		previewUrl: `https://${v4()}.${
			import.meta.env.VITE_PLAYGROUND_PREVIEW
		}/.update-preview-token?token=${encodeURIComponent(deploy.preview)}`,
		devtoolsUrl: deploy.tail,
		serialised: serialised,
	};
}

export function useDraftWorker(initialHash: string): {
	isLoading: boolean;
	service: Worker | null;
	previewService: Worker | null;
	devtoolsUrl: string | undefined;
	updateDraft: (content: Pick<Worker, "entrypoint" | "modules">) => void;
	preview: () => void;
	previewHash: PreviewHash | undefined;
	previewError: string | undefined;
	parseError: string | undefined;
	isPreviewUpdating: boolean;
} {
	const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);

	const {
		data: worker,
		isLoading,
		error,
	} = useSWR(initialHash, getPlaygroundWorker, {
		// There is no need to revalidate playground worker as it is rarely updated
		revalidateOnFocus: false,
	});

	const [draftWorker, setDraftWorker] =
		useState<Pick<Worker, "entrypoint" | "modules">>();
	const [previewWorker, setPreviewWorker] = useState(draftWorker);
	const [previewHash, setPreviewHash] = useState<PreviewHash>();
	const [previewError, setPreviewError] = useState<string>();
	const [devtoolsUrl, setDevtoolsUrl] = useState<string>();

	useEffect(() => {
		async function updatePreview(content: Worker) {
			try {
				setIsPreviewUpdating(true);
				const hash = await updatePreviewHash(content);
				setPreviewHash(hash);
				setDevtoolsUrl(hash.devtoolsUrl);
			} catch (e: unknown) {
				console.error(e);
				if (e instanceof Error) {
					setPreviewError(String(e.message));
				}
			} finally {
				setIsPreviewUpdating(false);
			}
		}

		if (worker) {
			void updatePreview({
				...worker,
				...previewWorker,
			});
		}
	}, [worker, previewWorker]);

	return {
		isLoading,
		service: worker ? { ...worker, ...draftWorker } : null,
		previewService: worker ? { ...worker, ...previewWorker } : null,
		preview: () => {
			if (previewWorker !== draftWorker) {
				setPreviewHash(undefined);
				setPreviewWorker(draftWorker);
			}
		},
		updateDraft: setDraftWorker,
		devtoolsUrl,
		previewHash,
		isPreviewUpdating,
		previewError: previewError,
		parseError: error?.toString(),
	};
}
