import { createHash, getRandomValues } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { hash as blake3hash } from "blake3-wasm";

export const pathHashFile = (filepath: string) => {
	// hack
	if (filepath.endsWith("index.html")) {
		filepath =
			"index." +
			Buffer.from(getRandomValues(new Uint8Array(6))).toString("hex") +
			".html";
	}

	return createHash("sha256").update(filepath).digest("hex").slice(0, 32);
};

export const contentAndTypeHashFile = (filepath: string) => {
	const contents = readFileSync(filepath);
	const base64Contents = contents.toString("base64");
	const extension = extname(filepath).substring(1);

	return blake3hash(base64Contents + extension)
		.toString("hex")
		.slice(0, 32);
};
