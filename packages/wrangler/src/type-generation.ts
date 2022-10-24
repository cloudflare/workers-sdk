import * as fs from "fs";
import { findUpSync } from "find-up";
import { getEntry } from "./entry";
import { logger } from "./logger";
import type { Config } from "./config";
import type { CfWorkerInit } from "./worker";

// Currently includes bindings & rules for declaring modules
type PartialConfigToDTS = CfWorkerInit["bindings"] & {
	rules: Config["rules"];
};
export async function generateTypes(
	configToDTS: PartialConfigToDTS,
	config: Config
) {
	const entry = await getEntry({}, config, "types");
	let envTypeStructure = "";

	if (configToDTS.kv_namespaces) {
		for (const kvNamespace of configToDTS.kv_namespaces) {
			envTypeStructure += `${kvNamespace.binding}: KVNamespace;
      `;
		}
	}

	if (configToDTS.vars) {
		for (const varName in configToDTS.vars) {
			const varValue = configToDTS.vars[varName];
			if (typeof varValue === "string") {
				envTypeStructure += `${varName}: "${varValue}";
        `;
			}
			if (typeof varValue === "object" && varValue !== null) {
				envTypeStructure += `${varName}: ${JSON.stringify(varValue)};
        `;
			}
		}
	}

	if (configToDTS.durable_objects?.bindings) {
		for (const durableObject of configToDTS.durable_objects.bindings) {
			envTypeStructure += `${durableObject.name}: DurableObjectNamespace;
      `;
		}
	}

	if (configToDTS.r2_buckets) {
		for (const R2Bucket of configToDTS.r2_buckets) {
			envTypeStructure += `${R2Bucket.binding}: R2Bucket;
      `;
		}
	}

	if (configToDTS.d1_databases) {
		for (const d1 of configToDTS.d1_databases) {
			envTypeStructure += `${d1.binding}: D1Database;
      `;
		}
	}

	if (configToDTS.services) {
		for (const service of configToDTS.services) {
			envTypeStructure += `${service.binding}: Fetcher;
      `;
		}
	}

	if (configToDTS.dispatch_namespaces) {
		for (const namespace of configToDTS.dispatch_namespaces) {
			envTypeStructure += `${namespace.binding}: any;
      `;
		}
	}

	if (configToDTS.logfwdr?.schema) {
		envTypeStructure += `LOGFWDR_SCHEMA: any;
    `;
	}

	if (configToDTS.data_blobs) {
		for (const dataBlobs in configToDTS.data_blobs) {
			envTypeStructure += `${dataBlobs}: ArrayBuffer;
      `;
		}
	}

	if (configToDTS.text_blobs) {
		for (const textBlobs in configToDTS.text_blobs) {
			envTypeStructure += `${textBlobs}: string;
      `;
		}
	}

	if (configToDTS.unsafe) {
		for (const unsafe of configToDTS.unsafe) {
			envTypeStructure += `${unsafe.name}: any;
      `;
		}
	}

	let modulesTypeStructure = "";
	if (configToDTS.rules) {
		for (const ruleObject of configToDTS.rules) {
			if (ruleObject.type === "Text") {
				ruleObject.globs.forEach((glob) => {
					modulesTypeStructure += `declare module "${glob}" {
			      const value: string;
			      export default value;
			    }
			    `;
				});
			}
			if (ruleObject.type === "Data") {
				ruleObject.globs.forEach((glob) => {
					modulesTypeStructure += `declare module "${glob}" {
            const value: ArrayBuffer;
            export default value;
          }
          `;
				});
			}
			if (ruleObject.type === "CompiledWasm") {
				ruleObject.globs.forEach((glob) => {
					modulesTypeStructure += `declare module "${glob}" {
            const value: WebAssembly.Module;
            export default value;
          }
          `;
				});
			}
		}
	}

	function writeDTSFileThenLog(template: string) {
		const wranglerOverrideDTSPath = findUpSync("wrangler-overrides.d.ts");
		if (
			wranglerOverrideDTSPath !== undefined &&
			fs.existsSync(wranglerOverrideDTSPath ?? "") &&
			!fs
				.readFileSync(wranglerOverrideDTSPath, "utf8")
				.includes("***AUTO GENERATED BY WORKERS CLI WRANGLER***")
		) {
			throw new Error(
				"A non-wrangler wrangler-overrides.d.ts already exists, please rename and try again."
			);
		}

		// Throw error if comment doesnt exist in a file named the same
		if (envTypeStructure.length || modulesTypeStructure.length) {
			fs.writeFileSync(
				"wrangler-overrides.d.ts",
				`***AUTO GENERATED BY WORKERS CLI WRANGLER***
				${template}
				${modulesTypeStructure}
			`
			);
			logger.log(template + "\n" + modulesTypeStructure);
		}
	}

	if (entry.format === "modules") {
		const typeTemplate = `interface Env {
    ${envTypeStructure}}`;
		writeDTSFileThenLog(typeTemplate);
	} else {
		const typeTemplate = `declare global {
			${envTypeStructure}}`;
		writeDTSFileThenLog(typeTemplate);
	}
}
