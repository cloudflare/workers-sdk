import assert from "node:assert";
import * as path from "node:path";
import { nonPrefixedNodeModules } from "@cloudflare/unenv-preset";
import type { NodeJsCompat } from "@cloudflare/workers-dev-shared";
import type * as vite from "vite";

export const nodeBuiltinsRE = new RegExp(
	`^(${nonPrefixedNodeModules.join("|")}|node:.+)$`
);

export function assertHasNodeJsCompat(
	nodeJsCompat: NodeJsCompat | undefined
): asserts nodeJsCompat is NodeJsCompat {
	assert(nodeJsCompat, `expected nodeJsCompat to be defined`);
}

export class NodeJsCompatWarnings {
	private sources = new Map<string, Set<string>>();
	private timer: NodeJS.Timeout | undefined;

	constructor(
		private readonly environmentName: string,
		private readonly resolvedViteConfig: vite.ResolvedConfig
	) {}

	registerImport(source: string, importer = "<unknown>") {
		const importers = this.sources.get(source) ?? new Set();
		this.sources.set(source, importers);
		importers.add(importer);
		this.renderWarningsOnIdle();
	}

	private renderWarningsOnIdle() {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.renderWarnings();
			this.timer = undefined;
		}, 500);
	}

	renderWarnings() {
		if (this.sources.size > 0) {
			let message =
				`Unexpected Node.js imports for environment "${this.environmentName}". ` +
				`Do you need to enable the "nodejs_compat" compatibility flag? ` +
				"Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.\n";
			this.sources.forEach((importers, source) => {
				importers.forEach((importer) => {
					message += ` - "${source}" imported from "${path.relative(this.resolvedViteConfig.root, importer)}"\n`;
				});
			});
			this.resolvedViteConfig.logger.warn(message, {
				timestamp: true,
			});
			this.sources.clear();
		}
	}
}
