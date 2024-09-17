// This file should be kept roughly in sync with https://github.com/cloudflare/wrangler2/tree/main/packages/quick-edit/web/cloudflare-logic/src/ipc.ts
// The types should match, but the implementation of Channel will differ
export interface EditorMessage<T extends string, B> {
	type: T;
	body: B;
}
// Sent on first load of worker
interface WorkerLoaded {
	entrypoint: string;
	name: string;
	files: {
		path: string;
		contents: Uint8Array;
	}[];
	readOnly?: boolean;
}

// Sent when a user updates a file
interface UpdateFile {
	path: string;
	contents: Uint8Array;
}

// Sent when a user creates a file
interface CreateFile {
	path: string;
	contents: Uint8Array;
}
// Sent when a user deletes a file
interface DeleteFile {
	path: string;
}

// Sent when a user sets an entrypoint
interface SetEntryPoint {
	path: string;
}

// Sent on load to request sources for inflating a stack trace
interface RequestSources {}

export type WorkerLoadedMessage = EditorMessage<"WorkerLoaded", WorkerLoaded>;

export type UpdateFileMessage = EditorMessage<"UpdateFile", UpdateFile>;
export type CreateFileMessage = EditorMessage<"CreateFile", CreateFile>;
export type DeleteFileMessage = EditorMessage<"DeleteFile", DeleteFile>;
export type SetEntryPointMessage = EditorMessage<
	"SetEntryPoint",
	SetEntryPoint
>;
export type RequestSourcesMessage = EditorMessage<
	"RequestSources",
	RequestSources
>;
export type SourcesLoadedMessage = EditorMessage<
	"SourcesLoaded",
	WorkerLoaded & { internalLines?: number }
>;

export type FromQuickEditMessage =
	| UpdateFileMessage
	| CreateFileMessage
	| DeleteFileMessage
	| SetEntryPointMessage;

export type ToQuickEditMessage = WorkerLoadedMessage;

export type FromErrorPage = RequestSourcesMessage;
export type ToErrorPage = SourcesLoadedMessage;

export type WrappedChannel<Send, Receive> = {
	remote: MessagePort;
	postMessage(message: Send, transfer?: Transferable[]): void;
	onMessage(cb: (data: Receive) => void): void;
};
export function Channel<Send, Receive>(
	messageChannel: MessageChannel
): WrappedChannel<Send, Receive> {
	return {
		remote: messageChannel.port2,
		postMessage(message: Send, transfer: Transferable[] = []) {
			return messageChannel.port1.postMessage(message, transfer);
		},
		onMessage(cb: (data: Receive) => void) {
			messageChannel.port1.onmessage = (e) => cb(e.data);
		},
	};
}
