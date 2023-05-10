import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { BlobStore, FileBlobStore, MemoryBlobStore } from "./blob";
import { TypedDatabase } from "./sql";

export interface Storage {
	db: TypedDatabase;
	blob: BlobStore;
}

export function createMemoryStorage(): Storage {
	const db = new Database(":memory:") as TypedDatabase;
	const blob = new MemoryBlobStore();
	return { db, blob };
}

export function createFileStorage(root: string): Storage {
	root = path.resolve(root);
	fs.mkdirSync(root, { recursive: true });
	const db = new Database(path.join(root, "db.sqlite")) as TypedDatabase;
	db.pragma("journal_mode = WAL");
	const blob = new FileBlobStore(path.join(root, "blobs"));
	return { db, blob };
}
