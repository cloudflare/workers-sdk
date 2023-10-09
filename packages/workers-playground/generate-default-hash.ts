import { readFile, writeFile } from "node:fs/promises";
import lzstring from "lz-string";
import { FormData, Response } from "undici";

const worker = new FormData();

const today = new Date();
const year = String(today.getUTCFullYear());
const month = String(today.getUTCMonth() + 1).padStart(2, "0");
const date = String(today.getUTCDate()).padStart(2, "0");

async function generateFileForWorker(worker: FormData) {
	return `export default "${await compressWorker(worker)}";\n`;
}

const metadata = {
	main_module: "index.js",
	compatibility_date: `${year}-${month}-${date}`,
	compatibility_flags: ["nodejs_compat"],
};

worker.set("metadata", JSON.stringify(metadata));

worker.set(
	"data.js",
	new Blob([await readFile("./welcome/data.js", "utf8")], {
		type: "application/javascript+module",
	}),
	"data.js"
);

worker.set(
	"index.js",
	new Blob([await readFile("./welcome/index.js", "utf8")], {
		type: "application/javascript+module",
	}),
	"index.js"
);

worker.set(
	"welcome.html",
	new Blob([await readFile("./welcome/welcome.html", "utf8")], {
		type: "text/plain",
	}),
	"welcome.html"
);

async function compressWorker(worker: FormData) {
	const serialisedWorker = new Response(worker);

	const generatedBoundary = serialisedWorker.headers
		.get("content-type")
		.split(";")[1]
		.split("=")[1]
		.trim();

	// This boundary is arbitrary, it's just specified for stability
	const fixedBoundary = "----formdata-88e2b909-318c-42df-af0d-9077f33c7988";

	return lzstring.compressToEncodedURIComponent(
		`multipart/form-data; boundary=${fixedBoundary}:${await (
			await serialisedWorker.text()
		).replaceAll(generatedBoundary, fixedBoundary)}`
	);
}

if (process.argv[2] === "check") {
	const currentFile = await readFile(
		"./src/QuickEditor/defaultHash.ts",
		"utf8"
	);
	const generated = await generateFileForWorker(worker);
	const equal = currentFile === generated;
	if (!equal) {
		console.log("Default hash not up to date", equal);
		console.log("current.txt", currentFile);
		console.log("gen.txt", generated);
	}
	process.exit(equal ? 0 : 1);
} else {
	await writeFile(
		"./src/QuickEditor/defaultHash.ts",
		await generateFileForWorker(worker)
	);
}
