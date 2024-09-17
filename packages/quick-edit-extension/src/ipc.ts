import type { MessagePassingProtocol } from "vscode";

export interface EditorMessage<T extends string, B> {
	type: T;
	body: B;
}
// Sent on first load of worker
interface WorkerLoaded {
	name: string;
	entrypoint: string;
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

export type WorkerLoadedMessage = EditorMessage<"WorkerLoaded", WorkerLoaded>;

export type UpdateFileMessage = EditorMessage<"UpdateFile", UpdateFile>;
export type CreateFileMessage = EditorMessage<"CreateFile", CreateFile>;
export type DeleteFileMessage = EditorMessage<"DeleteFile", DeleteFile>;
export type SetEntryPointMessage = EditorMessage<
	"SetEntryPoint",
	SetEntryPoint
>;

export type FromQuickEditMessage =
	| UpdateFileMessage
	| CreateFileMessage
	| DeleteFileMessage
	| SetEntryPointMessage;
export type ToQuickEditMessage = WorkerLoadedMessage;

export class Channel<Send, Receive> {
	constructor(readonly messagePassingProtocol: MessagePassingProtocol) {}
	postMessage(message: Send, transfer: ArrayBuffer[] = []) {
		return this.messagePassingProtocol.postMessage(message, transfer);
	}
	onMessage(cb: (data: Receive) => void) {
		return this.messagePassingProtocol.onDidReceiveMessage(cb);
	}
}
