// Adapted from https://github.com/microsoft/vscode-web-playground/blob/main/src/memfs.ts
// Original license:
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Channel, FromQuickEditMessage, ToQuickEditMessage } from "./ipc";
import {
	CancellationToken,
	Disposable,
	Event,
	EventEmitter,
	FileChangeEvent,
	FileChangeType,
	FileSearchOptions,
	FileSearchProvider,
	FileSearchQuery,
	FileStat,
	FileSystemError,
	FileSystemProvider,
	FileType,
	Position,
	Progress,
	ProviderResult,
	Range,
	TextSearchComplete,
	TextSearchOptions,
	TextSearchQuery,
	TextSearchProvider,
	TextSearchResult,
	Uri,
	workspace,
} from "vscode";
import { WorkerLoadedMessage } from "./ipc";

export class File implements FileStat {
	type: FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	data?: Uint8Array;

	constructor(public uri: Uri, name: string) {
		this.type = FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

export class Directory implements FileStat {
	type: FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	entries: Map<string, File | Directory>;

	constructor(public uri: Uri, name: string) {
		this.type = FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entries = new Map();
	}
}

export type Entry = File | Directory;

export class CFS
	implements
		FileSystemProvider,
		FileSearchProvider,
		TextSearchProvider,
		Disposable
{
	static scheme = "cfs";
	private rootFolder = "cfs:/worker";

	private readonly disposable: Disposable;

	private readonly channel: ReturnType<
		typeof Channel<FromQuickEditMessage, ToQuickEditMessage>
	>;

	private readRoot: ((value: [string, FileType][]) => void) | null = null;

	constructor(
		channel: ReturnType<
			typeof Channel<FromQuickEditMessage, ToQuickEditMessage>
		>
	) {
		this.channel = channel;
		this.disposable = Disposable.from(
			workspace.registerFileSystemProvider(CFS.scheme, this, {
				isCaseSensitive: true,
			}),
			workspace.registerFileSearchProvider(CFS.scheme, this),
			workspace.registerTextSearchProvider(CFS.scheme, this)
		);
	}

	dispose() {
		this.disposable?.dispose();
	}

	async seed(files: WorkerLoadedMessage["body"]) {
		this.rootFolder = files.name ?? this.rootFolder;
		this.createDirectory(Uri.parse(`cfs:/${this.rootFolder}/`));
		for (const { path, contents } of files.files) {
			const pathSegments = path.split("/");
			if (pathSegments.length > 1) {
				let created = this.rootFolder;
				for (const path of pathSegments.slice(0, -1)) {
					created = created + `/${path}`;
					try {
						await this.readDirectory(Uri.parse(created));
					} catch {
						await this.createDirectory(Uri.parse(created));
					}
				}
			}
			await this.writeFile(Uri.parse(`${this.rootFolder}/${path}`), contents, {
				create: true,
				overwrite: true,
				suppressChannelUpdate: true,
			});
		}
		if (this.readRoot !== null) {
			await this.readRoot(
				await this.readDirectory(Uri.parse(`${this.rootFolder}/`))
			);
		}
	}

	root = new Directory(Uri.parse("cfs:/"), "");

	stat(uri: Uri): FileStat {
		return this._lookup(uri, false);
	}

	async readDirectory(uri: Uri): Promise<[string, FileType][]> {
		const entry = this._lookupAsDirectory(uri, false);
		let result: [string, FileType][] = [];
		for (const [name, child] of entry.entries) {
			result.push([name, child.type]);
		}
		if (result.length === 0 && uri === Uri.parse(`${this.rootFolder}/`)) {
			return new Promise((resolve) => (this.readRoot = resolve));
		} else {
			return result;
		}
	}

	async readFile(uri: Uri): Promise<Uint8Array> {
		const data = this._lookupAsFile(uri, false).data;
		if (data) {
			return data;
		}
		throw FileSystemError.FileNotFound();
	}

	writeFile(
		uri: Uri,
		content: Uint8Array,
		options: {
			create: boolean;
			overwrite: boolean;
			suppressChannelUpdate?: boolean;
		}
	): void {
		let basename = this._basename(uri.path);
		let parent = this._lookupParentDirectory(uri);
		let entry = parent.entries.get(basename);
		if (entry instanceof Directory) {
			throw FileSystemError.FileIsADirectory(uri);
		}
		if (!entry && !options.create) {
			throw FileSystemError.FileNotFound(uri);
		}
		if (entry && options.create && !options.overwrite) {
			throw FileSystemError.FileExists(uri);
		}
		if (!entry) {
			entry = new File(uri, basename);
			parent.entries.set(basename, entry);
			if (!options.suppressChannelUpdate)
				this.channel.postMessage({
					type: "CreateFile",
					body: {
						path: uri.path.split(this.rootFolder)[1],
						contents: content,
					},
				});
			this._fireSoon({ type: FileChangeType.Created, uri });
		}
		entry.mtime = Date.now();
		entry.size = content.byteLength;
		entry.data = content;
		if (!options.suppressChannelUpdate)
			this.channel.postMessage({
				type: "UpdateFile",
				body: {
					path: uri.path.split(this.rootFolder)[1],
					contents: content,
				},
			});
		this._fireSoon({ type: FileChangeType.Changed, uri });
	}

	async rename(
		oldUri: Uri,
		newUri: Uri,
		options: { overwrite: boolean }
	): Promise<void> {
		if (!options.overwrite && this._lookup(newUri, true)) {
			throw FileSystemError.FileExists(newUri);
		}

		let entry = this._lookup(oldUri, false);
		let oldParent = this._lookupParentDirectory(oldUri);

		let newParent = this._lookupParentDirectory(newUri);
		let newName = this._basename(newUri.path);

		oldParent.entries.delete(entry.name);
		entry.name = newName;
		newParent.entries.set(newName, entry);

		this.channel.postMessage({
			type: "DeleteFile",
			body: {
				path: oldUri.path.split(this.rootFolder)[1],
			},
		});
		this.channel.postMessage({
			type: "CreateFile",
			body: {
				path: newUri.path.split(this.rootFolder)[1],
				contents: await this.readFile(newUri),
			},
		});

		this._fireSoon(
			{ type: FileChangeType.Deleted, uri: oldUri },
			{ type: FileChangeType.Created, uri: newUri }
		);
	}

	delete(uri: Uri): void {
		let dirname = uri.with({ path: this._dirname(uri.path) });
		let basename = this._basename(uri.path);
		let parent = this._lookupAsDirectory(dirname, false);
		if (!parent.entries.has(basename)) {
			throw FileSystemError.FileNotFound(uri);
		}
		parent.entries.delete(basename);
		parent.mtime = Date.now();
		parent.size -= 1;
		this.channel.postMessage({
			type: "DeleteFile",
			body: {
				path: uri.path.split(this.rootFolder)[1],
			},
		});
		this._fireSoon(
			{ type: FileChangeType.Changed, uri: dirname },
			{ uri, type: FileChangeType.Deleted }
		);
	}

	createDirectory(uri: Uri): void {
		let basename = this._basename(uri.path);
		let dirname = uri.with({ path: this._dirname(uri.path) });
		let parent = this._lookupAsDirectory(dirname, false);

		let entry = new Directory(uri, basename);
		parent.entries.set(entry.name, entry);
		parent.mtime = Date.now();
		parent.size += 1;
		this._fireSoon(
			{ type: FileChangeType.Changed, uri: dirname },
			{ type: FileChangeType.Created, uri }
		);
	}

	// --- lookup

	private _lookup(uri: Uri, silent: false): Entry;
	private _lookup(uri: Uri, silent: boolean): Entry | undefined;
	private _lookup(uri: Uri, silent: boolean): Entry | undefined {
		let parts = uri.path.split("/");
		let entry: Entry = this.root;
		for (const part of parts) {
			if (!part) {
				continue;
			}
			let child: Entry | undefined;
			if (entry instanceof Directory) {
				child = entry.entries.get(part);
			}
			if (!child) {
				if (!silent) {
					throw FileSystemError.FileNotFound(uri);
				} else {
					return undefined;
				}
			}
			entry = child;
		}
		return entry;
	}

	private _lookupAsDirectory(uri: Uri, silent: boolean): Directory {
		let entry = this._lookup(uri, silent);
		if (entry instanceof Directory) {
			return entry;
		}
		throw FileSystemError.FileNotADirectory(uri);
	}

	private _lookupAsFile(uri: Uri, silent: boolean): File {
		let entry = this._lookup(uri, silent);
		if (entry instanceof File) {
			return entry;
		}
		throw FileSystemError.FileIsADirectory(uri);
	}

	private _lookupParentDirectory(uri: Uri): Directory {
		const dirname = uri.with({ path: this._dirname(uri.path) });
		return this._lookupAsDirectory(dirname, false);
	}

	private _emitter = new EventEmitter<FileChangeEvent[]>();
	private _bufferedEvents: FileChangeEvent[] = [];
	private _fireSoonHandle?: any;

	readonly onDidChangeFile: Event<FileChangeEvent[]> = this._emitter.event;

	watch(_resource: Uri): Disposable {
		// ignore, fires for all changes...
		return new Disposable(() => {});
	}

	private _fireSoon(...events: FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);

		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}

		this._fireSoonHandle = setTimeout(() => {
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents.length = 0;
		}, 5);
	}

	private _basename(path: string): string {
		path = this._rtrim(path, "/");
		if (!path) {
			return "";
		}

		return path.substr(path.lastIndexOf("/") + 1);
	}

	private _dirname(path: string): string {
		path = this._rtrim(path, "/");
		if (!path) {
			return "/";
		}

		return path.substr(0, path.lastIndexOf("/"));
	}

	private _rtrim(haystack: string, needle: string): string {
		if (!haystack || !needle) {
			return haystack;
		}

		const needleLen = needle.length,
			haystackLen = haystack.length;

		if (needleLen === 0 || haystackLen === 0) {
			return haystack;
		}

		let offset = haystackLen,
			idx = -1;

		while (true) {
			idx = haystack.lastIndexOf(needle, offset - 1);
			if (idx === -1 || idx + needleLen !== offset) {
				break;
			}
			if (idx === 0) {
				return "";
			}
			offset = idx;
		}

		return haystack.substring(0, offset);
	}

	private _getFiles(): Set<File> {
		const files = new Set<File>();

		this._doGetFiles(this.root, files);

		return files;
	}

	private _doGetFiles(dir: Directory, files: Set<File>): void {
		dir.entries.forEach((entry) => {
			if (entry instanceof File) {
				files.add(entry);
			} else {
				this._doGetFiles(entry, files);
			}
		});
	}

	private _convertSimple2RegExpPattern(pattern: string): string {
		return pattern
			.replace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, "\\$&")
			.replace(/[\*]/g, ".*");
	}

	// --- search provider

	provideFileSearchResults(
		query: FileSearchQuery,
		_options: FileSearchOptions,
		_token: CancellationToken
	): ProviderResult<Uri[]> {
		return this._findFiles(query.pattern);
	}

	private _findFiles(query: string | undefined): Uri[] {
		const files = this._getFiles();
		const result: Uri[] = [];

		const pattern = query
			? new RegExp(this._convertSimple2RegExpPattern(query))
			: null;

		for (const file of files) {
			if (!pattern || pattern.exec(file.name)) {
				result.push(file.uri);
			}
		}

		return result;
	}

	private _textDecoder = new TextDecoder();

	async provideTextSearchResults(
		query: TextSearchQuery,
		options: TextSearchOptions,
		progress: Progress<TextSearchResult>,
		_token: CancellationToken
	) {
		const result: TextSearchComplete = { limitHit: false };

		const files = this._findFiles(options.includes[0]);
		if (files) {
			for (const file of files) {
				const content = this._textDecoder.decode(await this.readFile(file));

				const lines = content.split("\n");
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					const index = line.indexOf(query.pattern);
					if (index !== -1) {
						progress.report({
							uri: file,
							ranges: new Range(
								new Position(i, index),
								new Position(i, index + query.pattern.length)
							),
							preview: {
								text: line,
								matches: new Range(
									new Position(0, index),
									new Position(0, index + query.pattern.length)
								),
							},
						});
					}
				}
			}
		}

		return result;
	}
}
