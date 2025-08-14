import { Loading } from "@cloudflare/component-loading";
import { Div } from "@cloudflare/elements";
import { isDarkMode } from "@cloudflare/style-const";
import { Channel, DragContext, Frame } from "@cloudflare/workers-editor-shared";
import { useContext, useEffect, useRef, useState } from "react";
import type { TypedModule } from "./useDraftWorker";
import type {
	FromQuickEditMessage,
	ToQuickEditMessage,
	WorkerLoadedMessage,
	WrappedChannel,
} from "@cloudflare/workers-editor-shared";

function stripSlashPrefix(path: string) {
	return path[0] === "/" ? path.slice(1) : path;
}

const quickEditHost = "https://e98a7604.quick-edit-workers.devprod.cloudflare.dev";

function constructVSCodeURL(serviceId: string, baseURL: string) {
	const workerPath = `cfs:/${serviceId}`;

	const url = new URL(baseURL);
	url.searchParams.set("worker", workerPath);

	url.searchParams.set("theme", isDarkMode() ? "dark" : "default");

	return url.toString();
}

type Data = {
	name: string;
	entrypoint: string;
	files: Record<string, TypedModule>;
};

type Props = {
	content: Data | undefined;
	onChange: (update: Required<Pick<Data, "entrypoint" | "files">>) => void;
};

/**
 * This component handles communication with the embedded VSCode for Web instance.
 * To make changes _within_ VSCode for Web, see https://github.com/cloudflare/workers-sdk/packages/quick-edit
 *
 * This component:
 *  - Waits for VSCode's iframe to load
 *  - Sends a MessagePort to VSCode
 *    - Which is then caught by VSCode's entrypoint, which starts to initialise the VSCode chrome
 *  - Sends the loaded worker files to VSCode
 *    - Which uses them to setup an in-memory filesystem to expose to users
 *  - Listens to file update events from VSCode, and uses them to call draftWorker.preview
 *  - This updates Stratus's in-memory representation of the worker, as well as updating the edge preview session
 */
export function VSCodeEditor({ content, onChange }: Props) {
	const editor = useRef<HTMLIFrameElement>(null);
	const isPaneDragging = useContext(DragContext);

	const [quickEdit, setQuickEdit] = useState<WrappedChannel<
		ToQuickEditMessage,
		FromQuickEditMessage
	> | null>(null);

	const [loading, setLoading] = useState(true);

	const hasLoadedWorkerFiles = useRef(false);

	useEffect(() => {
		const editorRef = editor.current;
		if (editorRef === null) {
			throw new Error("Failed to load VSCode (ref unexpectedly null");
		}
		function handleLoad() {
			const channel = Channel<ToQuickEditMessage, FromQuickEditMessage>(
				new MessageChannel()
			);
			hasLoadedWorkerFiles.current = false;
			setQuickEdit(channel);

			if (editorRef !== null) {
				setLoading(false);

				editorRef.contentWindow?.postMessage("PORT", "*", [channel.remote]);
			}
		}
		editorRef.addEventListener("load", handleLoad);
		return () => editorRef.removeEventListener("load", handleLoad);
	}, []);

	useEffect(() => {
		if (quickEdit !== null) {
			quickEdit.onMessage((data) => {
				if (!content?.name) {
					return;
				}
				if (data.type === "SetEntryPoint") {
					const fileName = data.body.path.replace(`/${content.name}/`, "");

					onChange({
						files: content.files,
						entrypoint: fileName,
					});
				}
				if (data.type === "UpdateFile") {
					onChange({
						files: {
							...content.files,
							[stripSlashPrefix(data.body.path)]: {
								contents: data.body.contents,
								type: content.files?.[stripSlashPrefix(data.body.path)]?.type,
							},
						},
						entrypoint: content.entrypoint,
					});
				}
				if (data.type === "CreateFile") {
					onChange({
						files: {
							...content.files,
							[stripSlashPrefix(data.body.path)]: {
								contents: data.body.contents,
								type: content.files?.[stripSlashPrefix(data.body.path)]?.type,
							},
						},
						entrypoint: content.entrypoint,
					});
				}
				if (data.type === "DeleteFile") {
					const { [stripSlashPrefix(data.body.path)]: _toRemove, ...toKeep } =
						content.files ?? {};

					onChange({
						files: toKeep,
						entrypoint: content.entrypoint,
					});
				}
			});
		}
	}, [content, onChange, quickEdit]);

	useEffect(() => {
		if (content?.name && !hasLoadedWorkerFiles.current && quickEdit !== null) {
			const message: WorkerLoadedMessage = {
				type: "WorkerLoaded",
				body: {
					name: content.name,
					entrypoint: content?.entrypoint,
					files: Object.entries(content.files).map(([path, contents]) => ({
						path,
						contents: contents.contents,
					})),
				},
			};
			quickEdit.postMessage(message);
			hasLoadedWorkerFiles.current = true;
		}
	}, [content, quickEdit]);
	return (
		<Div position="relative">
			<Frame
				innerRef={editor}
				style={isPaneDragging ? { pointerEvents: "none" } : {}}
				src={constructVSCodeURL("workers-playground", quickEditHost)}
				sandbox="allow-same-origin allow-scripts"
			></Frame>
			{loading && (
				<Div
					zIndex={1000}
					p={2}
					position="relative"
					height="100%"
					display="flex"
					gap={2}
					backgroundColor={isDarkMode() ? "#313131" : "white"}
					justifyContent={"center"}
					alignItems={"center"}
				>
					<Loading size="4x" />
				</Div>
			)}
		</Div>
	);
}
