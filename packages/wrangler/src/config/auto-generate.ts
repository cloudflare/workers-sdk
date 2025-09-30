import { writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { formatCompatibilityDate } from "../utils/compatibility-date";
import type { FrameworkConfig } from "../framework-detection";

export interface GeneratedConfig {
	config: any;
	configPath: string;
	framework: FrameworkConfig;
	generated: boolean;
}

export class ConfigGenerator {
	constructor(private projectRoot: string = process.cwd()) {}

	async generateConfig(
		framework: FrameworkConfig,
		projectName: string
	): Promise<GeneratedConfig> {
		const compatibilityDate = formatCompatibilityDate(new Date());
		const config = this.createConfigForFramework(framework, projectName, compatibilityDate);
		const configPath = path.join(this.projectRoot, "wrangler.jsonc");
		
		this.writeConfigFile(config, configPath);

		return {
			config,
			configPath,
			framework,
			generated: true
		};
	}

	private createConfigForFramework(
		framework: FrameworkConfig,
		projectName: string,
		compatibilityDate: string
	): any {
		const config: any = {
			name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
			compatibility_date: compatibilityDate
		};

		// Add compatibility flags if framework requires them
		if (framework.deploy.compatibility_flags?.length) {
			config.compatibility_flags = framework.deploy.compatibility_flags;
		}

		// Add main entry point for SSR frameworks
		if (framework.deploy.type === 'ssr' && framework.deploy.main) {
			config.main = framework.deploy.main;
		}

		// Add assets configuration
		if (framework.deploy.assets) {
			config.assets = framework.deploy.assets;
		} else if (framework.deploy.type === 'static') {
			config.assets = {
				directory: framework.build.outputDir === '.' ? './' : framework.build.outputDir
			};
		}

		// Add observability for SSR frameworks
		if (framework.deploy.type === 'ssr') {
			config.observability = { enabled: true };
		}

		return config;
	}

	private writeConfigFile(config: any, configPath: string): void {
		try {
			const configJson = JSON.stringify(config, null, 2);
			writeFileSync(configPath, configJson, 'utf-8');
			
			const relativePath = path.relative(this.projectRoot, configPath);
			logger.log(`Generated ${relativePath}`);
		} catch (error) {
			logger.error(`Failed to write config file: ${error}`);
			throw error;
		}
	}
}

export async function generateConfigNonInteractive(
	projectRoot?: string,
	options: any = {}
): Promise<any> {
	// Simplified version for now
	return null;
}
