import { readFile, writeFile } from "node:fs/promises";
import { FormData, Response } from "undici";

async function serialiseHashes(
	workers: Record<string, FormData>
): Promise<Record<string, string>> {
	const workerHashes = {};
	for (const [name, worker] of Object.entries(workers)) {
		workerHashes[name] = await serialiseWorker(worker);
	}
	return workerHashes;
}

async function generateFileForWorker(workers: Record<string, FormData>) {
	const workerHashes = await serialiseHashes(workers);

	return `export default ${JSON.stringify(workerHashes, null, 2)};\n`;
}

const pythonWorker = async () => {
	const worker = new FormData();

	const metadata = {
		main_module: "index.py",
		compatibility_date: `$REPLACE_COMPAT_DATE`,
		compatibility_flags: ["python_workers"],
	};

	worker.set("metadata", JSON.stringify(metadata));

	worker.set(
		"index.py",
		new Blob([await readFile("./welcome/index.py", "utf8")], {
			type: "text/x-python",
		}),
		"index.py"
	);
	return worker;
};

const defaultWorker = async () => {
	const worker = new FormData();

	const metadata = {
		main_module: "index.js",
		compatibility_date: `$REPLACE_COMPAT_DATE`,
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

async function serialiseWorker(worker: FormData) {
	const serialisedWorker = new Response(worker);

	const generatedBoundary = serialisedWorker.headers
		.get("content-type")!
		.split(";")[1]
		.split("=")[1]
		.trim();

	// This boundary is arbitrary, it's just specified for stability
	const fixedBoundary = "----formdata-88e2b909-318c-42df-af0d-9077f33c7988";

	return {
		contentType: `multipart/form-data; boundary=${fixedBoundary}`,
		worker: await (
			await serialisedWorker.text()
		).replaceAll(generatedBoundary, fixedBoundary),
	};
}

const pythonWorkerContent = await pythonWorker();
const defaultWorkerContent = await defaultWorker();

if (process.argv[2] === "check") {
	const currentFile = await import("./src/QuickEditor/defaultHashes.ts");
	const generated = await serialiseHashes({
		"/python": pythonWorkerContent,
		"/": defaultWorkerContent,
	});

	const equal =
		currentFile.default["/"] === generated["/"] &&
		currentFile.default["/python"] === generated["/python"];
	if (!equal) {
		console.log("Hash not up to date", equal);
		console.log("current.txt", currentFile.default);
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
