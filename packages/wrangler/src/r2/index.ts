import { defineNamespace } from "../core";
import "./object";
import "./bucket";
import "./sippy";
import "./notification";
import "./domain";
import "./public-dev-url";
import * as Lifecycle from "./lifecycle";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";

defineNamespace({
	command: "wrangler r2",
	metadata: {
		description: "📦 Manage R2 buckets & objects",
		status: "stable",
		owner: "Product: R2",
	},
});

export function r2(r2Yargs: CommonYargsArgv, subHelp: SubHelp) {
	return r2Yargs
		.command(subHelp)
		.command("bucket", "Manage R2 buckets", (r2BucketYargs) => {
			r2BucketYargs.demandCommand();

			r2BucketYargs.command(
				"lifecycle",
				"Manage lifecycle rules for an R2 bucket",
				(lifecycleYargs) => {
					return lifecycleYargs.command(
						"set <bucket>",
						"Set the lifecycle configuration for an R2 bucket from a JSON file",
						Lifecycle.SetOptions,
						Lifecycle.SetHandler
					);
				}
			);
			return r2BucketYargs;
		});
}
