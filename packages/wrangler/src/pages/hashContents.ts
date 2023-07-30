import { hash as blake3hash } from "blake3-wasm";

export function hashContents(contents: string): string {
	return blake3hash(contents).toString("hex").slice(0, 32);
}
