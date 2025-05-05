// this test has to be run with a version of Node.js older than 16.13 to pass

const { spawn } = require("child_process");
const path = require("path");

const assert = require("assert");

const mode = process.argv[2];

const wranglerProcess = spawn(
	"node",
	[path.join(__dirname, "../../bin/wrangler.js"), "help"],
	{ stdio: "pipe" }
);

const messageToMatch = "Wrangler requires at least Node.js v";

wranglerProcess.once("exit", (code) => {
	try {
		if (mode === "error") {
			const errorMessage = wranglerProcess.stderr.read().toString();

			assert(code === 1, "Expected exit code 1");
			assert(
				errorMessage.includes(messageToMatch),
				`Expected error message to include "${messageToMatch}"`
			);
		} else {
			const warningMessage = wranglerProcess.stderr.read().toString();

			assert(code === 1, "Expected exit code 1");
			assert(
				warningMessage.includes(messageToMatch),
				`Expected error message to include "${messageToMatch}"`
			);
			// Wrangler should only warn, and so validate that the help text was shown
			assert(
				warningMessage.includes("Show help"),
				`Expected error message to include "Show help"`
			);
		}
	} catch (err) {
		console.error("Error:", err);
		throw new Error(
			"This test has to be run with a version of Node.js under 20 to pass"
		);
	}
});
