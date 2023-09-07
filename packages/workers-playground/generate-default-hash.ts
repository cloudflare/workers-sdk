import lzstring from "lz-string";
import { readFile, writeFile } from "node:fs/promises";
import { Response, FormData } from "undici";
const worker = new FormData();

const today = new Date();
const year = String(today.getUTCFullYear());
const month = String(today.getUTCMonth() + 1).padStart(2, "0");
const date = String(today.getUTCDate()).padStart(2, "0");

const metadata = {
	main_module: "index.js",
	compatibility_date: `${year}-${month}-${date}`,
	compatibility_flags: ["nodejs_compat"],
};

worker.set("metadata", JSON.stringify(metadata));

worker.set(
	"index.js",
	new Blob(
		[
			/*javascript*/ `
import welcome from "welcome.html"

/**
 * @typedef {Object} Env
*/

export default {
    /**
     * @param {Request} request
     * @param {Env} env
     * @param {ExecutionContext} ctx
     * @returns {Response}
     */
    fetch(request, env, ctx) {
        console.log("Hello Cloudflare Workers!")

        return new Response(welcome, {
            headers: {
                "content-type": "text/html"
            }
        })
    }
}
  `.trim(),
		],
		{
			type: "application/javascript+module",
		}
	),
	"index.js"
);

worker.set(
	"welcome.html",
	new Blob(
		[
			/*html*/ `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Workers Playground</title>
    <link rel="stylesheet" href="https://welcome.devprod.cloudflare.dev/style.css">
</head>

<body>
    <div class="circuits">
        <img src="https://welcome.devprod.cloudflare.dev/circuits.svg" />
    </div>
    <main>
        <img src="https://welcome.devprod.cloudflare.dev/logo.svg" class="logo" />
        <p>Welcome! Use this Playground to test drive a Worker, create a demo to share online, and when ready deploy
            directly to the edge by setting up a Cloudflare account.</p>
        <h1>What is a Worker?</h1>
        <p>A Cloudflare Worker is JavaScript code you write that handles your web site's HTTP traffic directly in
            Cloudflare's edge locations around the world, allowing you to locate code close to your end users in order
            to respond to them more quickly</p>
        <h1>Try it yourself</h1>
        <p>On your left is a sample Worker that is running on this site. You can edit it live and see the results here.
            Edit the path above to /api to see how the example Worker handles different routes. You can also edit the
            code to see what's possible and bring your next idea to life.</p>
    </main>
</body>

</html>
  `.trim(),
		],
		{
			type: "text/plain",
		}
	),
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
	const generated = `export default "${await compressWorker(worker)}"`;
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
		`export default "${await compressWorker(worker)}"`
	);
}
