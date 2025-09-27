import { existsSync, readFileSync } from "node:fs";
import { logger } from "../logger";
import type { FrameworkConfig } from "./frameworks";
import { FRAMEWORKS } from "./frameworks";

// Simple package manager detection without external dependencies
function detectPackageManager(): { npm: string } {
	if (existsSync('pnpm-lock.yaml')) return { npm: 'pnpm' };
	if (existsSync('yarn.lock')) return { npm: 'yarn' };
	if (existsSync('bun.lockb')) return { npm: 'bun' };
	return { npm: 'npm' };
}

export interface DetectionResult {
	framework: FrameworkConfig;
	packageManager: string;
	confidence: 'high' | 'medium' | 'low';
	packageJson: any;
}

export class FrameworkDetector {
	constructor(private projectRoot: string = process.cwd()) {}

	async detect(): Promise<DetectionResult | null> {
		logger.debug('Detecting framework...');

		const packageJson = await this.readPackageJson();
		
		// If no package.json, check for static site
		if (!packageJson) {
			const staticFramework = await this.detectStaticSite();
			if (staticFramework) {
				return {
					framework: staticFramework,
					packageManager: 'npm', // Default for static sites
					confidence: 'medium',
					packageJson: null
				};
			}
			return null;
		}

		const scores = await Promise.all(
			FRAMEWORKS.filter(f => f.name !== 'static').map(async (framework) => ({
				framework,
				score: await this.scoreFramework(framework, packageJson)
			}))
		);

		const bestMatch = scores
			.filter(s => s.score > 0)
			.sort((a, b) => b.score - a.score)[0];

		if (!bestMatch) {
			// If no framework detected but package.json exists, might still be static
			const staticFramework = await this.detectStaticSite();
			if (staticFramework) {
				return {
					framework: staticFramework,
					packageManager: detectPackageManager().npm,
					confidence: 'low',
					packageJson
				};
			}
			return null;
		}

		const confidence = this.calculateConfidence(bestMatch.score);
		const { npm: packageManager } = detectPackageManager();

		logger.debug(`Detected ${bestMatch.framework.name} with ${confidence} confidence`);
		
		return {
			framework: bestMatch.framework,
			packageManager,
			confidence,
			packageJson
		};
	}

	private async detectStaticSite(): Promise<FrameworkConfig | null> {
		logger.debug('Checking for static site...');
		
		// Look for index.html in common locations
		const staticLocations = [
			'index.html', // Root directory
			'public/index.html', // Public folder
			'dist/index.html', // Built static site
			'build/index.html', // Another common build folder
			'_site/index.html', // Jekyll
			'out/index.html' // Some static generators
		];

		for (const location of staticLocations) {
			if (this.pathExists(location)) {
				logger.debug('Detected static site');
				const staticFramework = FRAMEWORKS.find(f => f.name === 'static')!;
				
				// Update output directory based on where we found index.html
				if (location !== 'index.html') {
					staticFramework.build.outputDir = location.replace('/index.html', '');
				}
				
				return staticFramework;
			}
		}

		return null;
	}

	private async scoreFramework(framework: FrameworkConfig, packageJson: any): Promise<number> {
		let score = 0;

		// Check dependencies first (higher priority for specific frameworks)
		if (framework.detection.dependencies) {
			const allDeps = {
				...packageJson.dependencies,
				...packageJson.devDependencies
			};

			for (const dep of framework.detection.dependencies) {
				if (allDeps[dep]) {
					// Give Angular highest priority when detected
					if (framework.name === 'angular' && (dep === '@angular/core' || dep === '@angular/cli')) {
						score += 200;
					}
					// Give Nuxt high priority
					else if (framework.name === 'nuxt' && dep === 'nuxt') {
						score += 180;
					}
					// Give React Router v7 higher priority over generic React
					else if (framework.name === 'react-router' && (dep === 'react-router' || dep === '@react-router/dev')) {
						score += 200; // Highest priority
					} 
					// Give Next.js high priority
					else if (framework.name === 'nextjs' && dep === 'next') {
						score += 150;
					}
					// Give Astro high priority
					else if (framework.name === 'astro' && dep === 'astro') {
						score += 150;
					}
					// Give SvelteKit high priority  
					else if (framework.name === 'svelte' && dep === '@sveltejs/kit') {
						score += 150;
					}
					// Classic Remix gets medium priority
					else if (framework.name === 'remix') {
						score += 100;
					}
					// Generic React + Vite gets lower priority
					else if (framework.name === 'react') {
						score += 50;
					} else {
						score += 75;
					}
				}
			}
		}

		// Check config files (medium priority)
		if (framework.detection.configFiles) {
			for (const configFile of framework.detection.configFiles) {
				if (this.pathExists(configFile)) {
					score += 100;
					break;
				}
			}
		}

		return score;
	}

	private calculateConfidence(score: number): 'high' | 'medium' | 'low' {
		if (score >= 150) return 'high';
		if (score >= 75) return 'medium';
		return 'low';
	}

	private async readPackageJson(): Promise<any> {
		try {
			const packageJsonPath = `${this.projectRoot}/package.json`;
			if (!this.pathExists(packageJsonPath)) {
				return null;
			}
			const content = readFileSync(packageJsonPath, 'utf-8');
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	private pathExists(path: string): boolean {
		return existsSync(`${this.projectRoot}/${path}`) || existsSync(path);
	}

	// Enhanced detection for better accuracy
	async detectWithContext(): Promise<DetectionResult | null> {
		const result = await this.detect();
		if (!result) return null;

		// Add additional context-based validation
		result.framework = await this.enhanceFrameworkConfig(result.framework, result.packageJson);
		
		return result;
	}

	private async enhanceFrameworkConfig(
		framework: FrameworkConfig, 
		packageJson: any
	): Promise<FrameworkConfig> {
		const enhanced = { ...framework };
		
		// Don't adapt commands for static sites (no package manager)
		if (framework.name === 'static') {
			return enhanced;
		}
		
		// Adapt commands for detected package manager
		const { npm: packageManager } = detectPackageManager();
		enhanced.build.command = this.adaptCommand(framework.build.command, packageManager);
		if (enhanced.dev?.command) {
			enhanced.dev.command = this.adaptCommand(enhanced.dev.command, packageManager);
		}
		
		return enhanced;
	}

	private adaptCommand(command: string, packageManager: string): string {
		if (!command || command.startsWith('npm run')) {
			const script = command.replace('npm run ', '');
			switch (packageManager) {
				case 'pnpm': return `pnpm ${script}`;
				case 'yarn': return `yarn ${script}`;
				case 'bun': return `bun run ${script}`;
				default: return command;
			}
		}
		return command;
	}
}
