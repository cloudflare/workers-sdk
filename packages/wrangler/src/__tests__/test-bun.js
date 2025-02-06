// this test has to be run with a version of Node.js older than 16.13 to pass

const { spawn } = require("child_process");
const path = require("path");

const assert = require("assert");

const wranglerProcess = spawn(
	"bun",
	[path.join(__dirname, "../../bin/wrangler.js")],
	{ stdio: "pipe" }
);

const messageToMatch = "Wrangler does not support Bun";

wranglerProcess.once("exit", (code) => {
	const errorMessage = wranglerProcess.stderr.read().toString();

	assert(code === 1, "Expected exit code 1");
	assert(
		errorMessage.includes(messageToMatch),
		`Expected error message to include "${messageToMatch}". Instead, found "${errorMessage}"`
	);
});
