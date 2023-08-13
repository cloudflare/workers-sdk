import assert from "node:assert";
import { spawnSync } from "node:child_process";
import semiver from "semiver";

const error = new Error(
	"Git version 2.28 or higher must be installed to run the wrangler test suite!"
);

const gitVersionOutput = /\d+\.\d+\.\d+/.exec(
	spawnSync("git", ["--version"], { encoding: "utf-8" }).stdout
);

if (gitVersionOutput === null) {
	throw error;
}

const installedGitVersion = gitVersionOutput[0];

assert(semiver(installedGitVersion, "2.28.0") >= 0, error);
