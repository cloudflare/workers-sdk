import { eg, TypeFromCodec } from "@cloudflare/util-en-garde";
import { useDebounce } from "@cloudflare/util-hooks";
import lzstring from "lz-string";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { v4 } from "uuid";
import { getPlaygroundWorker } from "./getPlaygroundWorker";
import { matchFiles, parseRules, toMimeType } from "./module-collection";

export const DeployPlaygroundWorkerResponse = eg.union([
	eg.object({
		inspector: eg.string,
		preview: eg.string,
	}),
	eg.object({
		error: eg.string,
		message: eg.string,
	}),
]);

const PreviewAPIErrorCodec = eg.array(
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

async function compressWorker(worker: FormData) {
	const serialisedWorker = new Response(worker);
	return lzstring.compressToEncodedURIComponent(
		`${serialisedWorker.headers.get(
			"content-type"
		)}:${await serialisedWorker.text()}`
	);
}

async function updatePreviewHash(
	content: Worker,
	updateWorkerHash: (hash: string) => void
): Promise<PreviewHash> {
	const worker = serialiseWorker(content);
	const serialised = await compressWorker(worker);
	const playgroundUrl = `/playground#${serialised}`;
	updateWorkerHash(playgroundUrl);

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
		devtoolsUrl: `wss://${import.meta.env.VITE_PLAYGROUND_ROOT}${
			deploy.inspector
		}`,
		serialised: serialised,
	};
}

const DEBOUNCE_TIMEOUT = 1000;

export function useDraftWorker(
	initialHash: string,
	updateWorkerHash: (hash: string) => void
): {
	isLoading: boolean;
	service: Worker | null;
	devtoolsUrl: string | undefined;
	preview: (content: Pick<Worker, "entrypoint" | "modules">) => void;
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
	} = useSWR(initialHash, getPlaygroundWorker);

	const [draftWorker, setDraftWorker] =
		useState<Pick<Worker, "entrypoint" | "modules">>();

	const [previewHash, setPreviewHash] = useState<PreviewHash>();
	const [previewError, setPreviewError] = useState<string>();
	const [devtoolsUrl, setDevtoolsUrl] = useState<string>();

	const updatePreview = useDebounce(
		async (wk?: Pick<Worker, "entrypoint" | "modules">) => {
			setDraftWorker(wk);
			if (worker === undefined) {
				return;
			}
			try {
				setIsPreviewUpdating(true);
				const hash = await updatePreviewHash(
					{
						...worker,
						...(wk ?? draftWorker),
					},
					updateWorkerHash
				);
				setPreviewHash(hash);
				setDevtoolsUrl(hash.devtoolsUrl);
			} catch (e: unknown) {
				console.error(e);
				if (e instanceof Error) setPreviewError(String(e.message));
			} finally {
				setIsPreviewUpdating(false);
			}
		},
		DEBOUNCE_TIMEOUT
	);

	const initialPreview = useRef(false);
	useEffect(() => {
		if (worker && !initialPreview.current) {
			initialPreview.current = true;
			setIsPreviewUpdating(true);
			void updatePreview(worker).then(() => setIsPreviewUpdating(false));
		}
	}, [worker]);

	return {
		isLoading,
		service: worker ? { ...worker, ...draftWorker } : null,
		preview: (...args) => {
			// updatePreview is debounced, so call setPreviewHash outside of it
			setPreviewHash(undefined);
			setPreviewError(undefined);
			void updatePreview(...args);
		},
		devtoolsUrl,
		previewHash,
		isPreviewUpdating,
		previewError: previewError,
		parseError: error?.toString(),
	};
}
