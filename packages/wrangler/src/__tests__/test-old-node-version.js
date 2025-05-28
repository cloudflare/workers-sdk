// this test has to be run with a version of Node.js older than 16.13 to pass

const { spawn } = require("child_process");
const path = require("path");

const assert = require("assert");

const mode = process.argv[2];

// We need to run a Wrangler command that will cause the warning banner to be shown.
// (`wrangler help` does not do this.)
const wranglerProcess = spawn(
	"node",
	[path.join(__dirname, "../../bin/wrangler.js"), "whoami"],
	{ stdio: "pipe" }
);

const messageToMatch = /Wrangler requires at least Node\.js v\d+/;

wranglerProcess.once("exit", (code) => {
	try {
		if (mode === "error") {
			const errorMessage = wranglerProcess.stderr.read().toString();

			assert.equal(code, 1, "Expected exit code 1");
			assert.match(
				errorMessage,
				messageToMatch,
				`Expected error message to include "${messageToMatch}"`
			);
		} else {
			const warningMessage = wranglerProcess.stderr.read().toString();

			// Wrangler should only warn, and so validate that the process exits cleanly
			assert.equal(code, 0, "Expected exit code 0");
			assert.match(
				warningMessage,
				messageToMatch,
				`Expected error message to include "${messageToMatch}"`
			);
		}
	} catch (err) {
		console.error("Error:", err);
		throw new Error(
			"This test has to be run with a version of Node.js under 20 to pass"
		);
	}
});
