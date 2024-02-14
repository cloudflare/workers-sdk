import { readFile, writeFile } from "node:fs/promises";
import lzstring from "lz-string";
import { FormData, Response } from "undici";

const today = new Date();
const year = String(today.getUTCFullYear());
const month = String(today.getUTCMonth() + 1).padStart(2, "0");
const date = String(today.getUTCDate()).padStart(2, "0");

async function generateFileForWorker(workers: Record<string, FormData>) {
	const workerHashes = {};
	for (const [name, worker] of Object.entries(workers)) {
		workerHashes[name] = await compressWorker(worker);
	}

	return `export default ${JSON.stringify(workerHashes)};\n`;
}

const pythonWorker = async () => {
	const worker = new FormData();

	const metadata = {
		main_module: "index.py",
		compatibility_date: `${year}-${month}-${date}`,
		compatibility_flags: ["experimental"],
	};

	worker.set("metadata", JSON.stringify(metadata));

	worker.set(
		"index.py",
		new Blob([await readFile("./welcome/index.py", "utf8")], {
			type: "text/x-python",
		}),
		"index.py"
	);

	worker.set(
		"requirements.txt",
		new Blob([await readFile("./welcome/requirements.txt", "utf8")], {
			type: "text/plain",
		}),
		"requirements.txt"
	);
	return worker;
};

const defaultWorker = async () => {
	const worker = new FormData();

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
	return worker;
};

async function compressWorker(worker: FormData) {
	const serialisedWorker = new Response(worker);

	const generatedBoundary = serialisedWorker.headers
		.get("content-type")!
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

const pythonWorkerContent = await pythonWorker();
const defaultWorkerContent = await defaultWorker();

if (process.argv[2] === "check") {
	const currentFile = await readFile(
		"./src/QuickEditor/defaultHashes.ts",
		"utf8"
	);
	const generated = await generateFileForWorker({
		"/python": pythonWorkerContent,
		"/": defaultWorkerContent,
	});
	const equal = currentFile === generated;
	if (!equal) {
		console.log("Default hash not up to date", equal);
		console.log("current.txt", currentFile);
		console.log("gen.txt", generated);
	}
	process.exit(equal ? 0 : 1);
} else {
	await writeFile(
		"./src/QuickEditor/defaultHashes.ts",
		await generateFileForWorker({
			"/python": pythonWorkerContent,
			"/": defaultWorkerContent,
		})
	);
}
