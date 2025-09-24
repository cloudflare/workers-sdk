import { logger } from "../logger";
import { confirm, select } from "../dialogs";
import { UserError } from "../errors";
import { FRAMEWORKS, getFrameworkByName } from "./frameworks";
import type { FrameworkConfig } from "./frameworks";

export class FrameworkDetectionError extends Error {
	constructor(
		message: string,
		public readonly suggestions?: string[],
		public readonly detectedFiles?: string[]
	) {
		super(message);
		this.name = "FrameworkDetectionError";
	}
}

export async function handleDetectionFailure(
	projectRoot: string,
	interactive: boolean = false
): Promise<FrameworkConfig | null> {
	if (!interactive) {
		throw new FrameworkDetectionError(
			"No supported framework detected. Please create a wrangler.jsonc file or ensure your project uses a supported framework.",
			getSupportedFrameworksList(),
			[]
		);
	}

	// Show what we support and let user choose
	logger.log("\n🤔 Unable to automatically detect your framework.");
	logger.log("Supported frameworks and static sites:");
	
	const choices = FRAMEWORKS.map(framework => ({
		name: formatFrameworkChoice(framework),
		value: framework.name,
		disabled: false
	}));

	choices.push({
		name: "❌ None of these (create minimal config)",
		value: "none",
		disabled: false
	});

	const selected = await select({
		message: "Which framework are you using?",
		choices
	});

	if (selected === "none") {
		return null;
	}

	const framework = getFrameworkByName(selected);
	if (!framework) {
		throw new Error(`Unknown framework: ${selected}`);
	}

	logger.log(`\n✅ Selected ${framework.name}`);
	return framework;
}

export function provideBetterErrorMessages(error: unknown): Error {
	if (error instanceof Error) {
		// Common configuration issues
		if (error.message.includes("Missing entry-point")) {
			return new UserError(
				"No Worker script or assets directory found.\n\n" +
				"🔍 Quick fixes:\n" +
				"  • Add a 'main' field to your wrangler.jsonc pointing to your Worker script\n" +
				"  • Add an 'assets' field pointing to your static files directory\n" +
				"  • Use --script to specify your Worker entry point\n" +
				"  • Use --assets to specify your static assets directory\n\n" +
				"📚 Supported projects: Next.js, Astro, SvelteKit, Nuxt, React, Angular, Remix, static sites",
				{ telemetryMessage: "missing entry point with suggestions" }
			);
		}

		if (error.message.includes("Could not find")) {
			return new UserError(
				"Configuration file not found.\n\n" +
				"🚀 Let Wrangler help you:\n" +
				"  • Run 'wrangler deploy' to auto-detect your framework\n" +
				"  • Create a wrangler.jsonc file manually\n" +
				"  • Use 'wrangler init' to set up a new project\n\n" +
				"📦 Auto-detection works for: Next.js, Astro, SvelteKit, Nuxt, React, Angular, Remix",
				{ telemetryMessage: "config not found with auto-detect suggestion" }
			);
		}

		// Build-related errors
		if (error.message.includes("build") && error.message.includes("failed")) {
			return new UserError(
				"Framework build failed.\n\n" +
				"🔧 Try these solutions:\n" +
				"  • Install dependencies: npm install\n" +
				"  • Check your build script in package.json\n" +
				"  • Ensure your framework adapter is installed\n" +
				"  • Run the build command manually first\n\n" +
				"💡 Use --skip-framework-detection to bypass auto-setup",
				{ telemetryMessage: "build failed with troubleshooting" }
			);
		}

		// Adapter installation errors
		if (error.message.includes("adapter") || error.message.includes("package")) {
			return new UserError(
				"Failed to install framework adapter.\n\n" +
				"🛠️ Manual installation required:\n" +
				"  • Check your internet connection\n" +
				"  • Ensure you have write permissions\n" +
				"  • Try installing the adapter manually\n" +
				"  • Use --skip-framework-detection to deploy without auto-setup\n\n" +
				"📖 See framework-specific setup guides in Cloudflare docs",
				{ telemetryMessage: "adapter installation failed" }
			);
		}
	}

	return error instanceof Error ? error : new Error(String(error));
}

export function showFrameworkHelp(): void {
	logger.log("\n📚 Framework Support in Wrangler");
	logger.log("━".repeat(50));
	
	const categories = {
		"🖼️ Static Sites": FRAMEWORKS.filter(f => f.deploy.type === 'static'),
		"⚡ SSR Frameworks": FRAMEWORKS.filter(f => f.deploy.type === 'ssr')
	};

	Object.entries(categories).forEach(([category, frameworks]) => {
		logger.log(`\n${category}:`);
		frameworks.forEach(framework => {
			const description = getFrameworkDescription(framework);
			logger.log(`  • ${framework.name.padEnd(15)} ${description}`);
		});
	});

	logger.log("\n🚀 Getting Started:");
	logger.log("  • Run 'wrangler deploy' in your project directory");
	logger.log("  • Wrangler will auto-detect and configure your framework");
	logger.log("  • Use 'wrangler init' to start a new project");

	logger.log("\n🔧 Manual Configuration:");
	logger.log("  • Use --skip-framework-detection to disable auto-setup");
	logger.log("  • Create a wrangler.jsonc file for custom configurations");

	logger.log("\n📖 Documentation:");
	logger.log("  • https://developers.cloudflare.com/workers/frameworks/");
}

export async function suggestProjectSetup(
	detectedFiles: string[],
	interactive: boolean = false
): Promise<void> {
	if (!interactive) return;

	logger.log("\n🔍 We found these files in your project:");
	detectedFiles.forEach(file => logger.log(`  • ${file}`));

	const hasPackageJson = detectedFiles.includes('package.json');
	const hasIndexHtml = detectedFiles.some(f => f.endsWith('index.html'));

	if (hasPackageJson && !hasIndexHtml) {
		logger.log("\n💡 This looks like a Node.js project.");
		logger.log("Consider using a supported framework like Next.js, Astro, or SvelteKit.");
		
		const learnMore = await confirm(
			"Would you like to see supported frameworks?",
			{ defaultValue: false }
		);
		
		if (learnMore) {
			showFrameworkHelp();
		}
	} else if (hasIndexHtml && !hasPackageJson) {
		logger.log("\n📄 This looks like a static site.");
		logger.log("Wrangler can deploy this using the --assets flag.");
		
		const setupAssets = await confirm(
			"Set up static site deployment?",
			{ defaultValue: true }
		);
		
		if (setupAssets) {
			logger.log("\n✨ Use: wrangler deploy --assets ./");
			logger.log("Or let Wrangler generate a config file for you.");
		}
	}
}

function formatFrameworkChoice(framework: FrameworkConfig): string {
	const icon = getFrameworkIcon(framework.name);
	const type = framework.deploy.type.toUpperCase();
	return `${icon} ${framework.name} (${type})`;
}

function getFrameworkIcon(name: string): string {
	const icons: Record<string, string> = {
		'nextjs': '⚡',
		'astro': '🚀',
		'nuxt': '💚',
		'svelte': '🧡',
		'react': '⚛️',
		'angular': '🅰️',
		'remix': '💿',
		'react-router': '🛣️',
		'static': '📄'
	};
	return icons[name] || '📦';
}

function getFrameworkDescription(framework: FrameworkConfig): string {
	const descriptions: Record<string, string> = {
		'nextjs': 'React with SSR/SSG',
		'astro': 'Multi-framework static site generator',
		'nuxt': 'Vue.js with SSR/SSG',
		'svelte': 'Svelte with SSR/SSG',
		'react': 'React SPA with Vite',
		'angular': 'Angular web framework',
		'remix': 'Full-stack React framework',
		'react-router': 'React with file-based routing',
		'static': 'Plain HTML/CSS/JS sites'
	};
	return descriptions[framework.name] || 'Framework support';
}

function getSupportedFrameworksList(): string[] {
	return [
		"Supported frameworks:",
		"  • Next.js (with OpenNext)",
		"  • Astro (SSR & Static)",
		"  • SvelteKit",
		"  • Nuxt 3",
		"  • React (Vite)",
		"  • Angular",
		"  • Remix",
		"  • React Router v7",
		"  • Static HTML sites",
		"",
		"Need help? Check: https://developers.cloudflare.com/workers/frameworks/"
	];
}
