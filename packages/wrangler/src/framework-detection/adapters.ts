import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execa } from "execa";
import { logger } from "../logger";
import { getFrameworkByName } from "./frameworks";

// Simple package manager detection
function detectPackageManager(): { npm: string } {
	if (existsSync('pnpm-lock.yaml')) return { npm: 'pnpm' };
	if (existsSync('yarn.lock')) return { npm: 'yarn' };
	if (existsSync('bun.lockb')) return { npm: 'bun' };
	return { npm: 'npm' };
}

export async function installFrameworkAdapter(
	frameworkName: string,
	projectRoot?: string
): Promise<void> {
	const framework = getFrameworkByName(frameworkName);
	if (!framework?.c3Config) {
		logger.debug(`No adapter configuration found for ${frameworkName}`);
		return;
	}

	logger.log(`Setting up ${frameworkName} for Cloudflare Workers...`);
	
	try {
		// Ensure dependencies are installed first
		await ensureDependencies();

		// Install and configure framework-specific adapters
		switch (frameworkName) {
			case 'astro':
				await setupAstro();
				break;
			case 'nextjs':
				await setupNextJS();
				break;
			case 'nuxt':
				await setupNuxt();
				break;
			case 'svelte':
				await setupSvelte();
				break;
			case 'angular':
				await setupAngular();
				break;
			case 'remix':
				await setupRemix();
				break;
			case 'react-router':
				await setupReactRouter();
				break;
			case 'nodejs-http':
				await setupNodeServer(projectRoot);
				break;
			default:
				logger.debug(`No specific setup needed for ${frameworkName}`);
				return;
		}

		// Build the project after setup (skip for nodejs-http as no build needed)
		if (frameworkName !== 'nodejs-http') {
			await buildProject();
		}
		
		logger.log(`${frameworkName} setup completed successfully`);
	} catch (error) {
		logger.warn(`Failed to set up ${frameworkName} adapter:`, error);
		logger.log("The project may need manual setup. Please follow the framework's Cloudflare deployment guide.");
		throw error;
	}
}

async function ensureDependencies(): Promise<void> {
	const { npm } = detectPackageManager();
	
	if (!existsSync('node_modules')) {
		logger.log("Installing dependencies...");
		await execa(npm, ['install'], { stdio: 'inherit' });
	}
}

async function setupAstro(): Promise<void> {
	const { npm } = detectPackageManager();
	
	try {
		// Use astro add command to install and configure the adapter
		logger.log("Installing Astro Cloudflare adapter...");
		await execa(npm === 'npm' ? 'npx' : npm, ['astro', 'add', 'cloudflare', '-y'], { 
			stdio: 'inherit',
			timeout: 60000 // 60 second timeout
		});
		logger.log("Astro Cloudflare adapter installed successfully");
	} catch (error) {
		// Fallback to manual installation
		logger.log("Automatic installation failed, trying manual approach...");
		await execa(npm, ['install', '@astrojs/cloudflare'], { stdio: 'inherit' });
		await updateAstroConfig();
		logger.log("Manual adapter installation completed");
	}
}

async function updateAstroConfig(): Promise<void> {
	const configFile = 'astro.config.mjs';
	if (!existsSync(configFile)) return;

	let content = readFileSync(configFile, 'utf8');
	
	// Check if already configured
	if (content.includes('@astrojs/cloudflare')) {
		return;
	}

	// Add Cloudflare adapter import and configuration
	const hasCloudflareImport = content.includes("import cloudflare from '@astrojs/cloudflare'");
	
	if (!hasCloudflareImport) {
		// Add import at the top
		content = "import cloudflare from '@astrojs/cloudflare';\n" + content;
	}

	// Update the adapter in defineConfig
	if (content.includes('adapter:')) {
		// Replace existing adapter
		content = content.replace(/adapter:\s*[^,}]+/, 'adapter: cloudflare()');
	} else {
		// Add adapter to existing config
		content = content.replace(
			/export default defineConfig\(\{/,
			'export default defineConfig({\n  adapter: cloudflare(),'
		);
	}

	writeFileSync(configFile, content);
	logger.log("Updated astro.config.mjs");
}

async function setupNextJS(): Promise<void> {
	const { npm } = detectPackageManager();
	
	// Install @opennextjs/cloudflare
	logger.log("Installing OpenNext Cloudflare adapter...");
	await execa(npm, ['install', '@opennextjs/cloudflare@^1.3.0'], { stdio: 'inherit' });
	
	// Fix Turbopack issue first
	await fixTurbopackIssue();
	await updateNextConfig();
	await createOpenNextConfig();
}

async function fixTurbopackIssue(): Promise<void> {
	try {
		if (!existsSync('package.json')) return;
		
		const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
		const buildScript = packageJson.scripts?.build;
		
		if (buildScript?.includes('--turbopack')) {
			logger.log('Removing --turbopack flag (not compatible with OpenNext)...');
			
			// Remove --turbopack flag from build script
			packageJson.scripts.build = buildScript
				.replace(' --turbopack', '')
				.replace('--turbopack ', '')
				.replace('--turbopack', '');
			
			// Ensure we have a clean build command
			if (!packageJson.scripts.build.includes('next build')) {
				packageJson.scripts.build = 'next build';
			}
			
			writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
			logger.log('Updated package.json build script');
		}
	} catch (error) {
		logger.debug('Could not check/fix Turbopack issue:', error);
	}
}

async function updateNextConfig(): Promise<void> {
	const configFiles = ['next.config.ts', 'next.config.mjs', 'next.config.js'];
	let configFile = null;

	for (const file of configFiles) {
		if (existsSync(file)) {
			configFile = file;
			break;
		}
	}

	if (configFile) {
		const content = readFileSync(configFile, 'utf8');
		
		// Add OpenNext initialization
		const openNextImport = `
// Added by wrangler for Cloudflare deployment
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
`;

		const updatedContent = content + openNextImport;
		writeFileSync(configFile, updatedContent);
		logger.log(`Updated ${configFile}`);
	}
}

async function createOpenNextConfig(): Promise<void> {
	if (existsSync('open-next.config.ts')) return;

	const openNextConfig = `import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Add your configuration here
});`;

	writeFileSync('open-next.config.ts', openNextConfig);
	logger.log("Created open-next.config.ts");
}

async function setupNuxt(): Promise<void> {
	const { npm } = detectPackageManager();
	
	// Install packages
	const packages = ['nitro-cloudflare-dev', 'nitropack'];
	if (npm === 'pnpm') {
		packages.push('h3');
	}
	
	logger.log("Installing Nuxt Cloudflare dependencies...");
	await execa(npm, ['install', '-D', ...packages], { stdio: 'inherit' });
	
	await updateNuxtConfig();
}

async function updateNuxtConfig(): Promise<void> {
	const configFiles = ['nuxt.config.ts', 'nuxt.config.js'];
	let configFile = null;
	
	for (const file of configFiles) {
		if (existsSync(file)) {
			configFile = file;
			break;
		}
	}

	if (configFile) {
		let content = readFileSync(configFile, 'utf8');
		
		// Check if already configured
		if (content.includes('cloudflare_module')) {
			return;
		}
		
		// Add Cloudflare configuration
		const nitroConfig = `
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    }
  },
  modules: ['nitro-cloudflare-dev'],`;
		
		if (content.includes('defineNuxtConfig({')) {
			content = content.replace(
				/defineNuxtConfig\(\{/,
				`defineNuxtConfig({${nitroConfig}`
			);
		} else {
			content = `export default defineNuxtConfig({${nitroConfig}
})`;
		}
		
		writeFileSync(configFile, content);
		logger.log(`Updated ${configFile}`);
	}
}

async function setupSvelte(): Promise<void> {
	const { npm } = detectPackageManager();
	
	logger.log("Installing SvelteKit Cloudflare adapter...");
	await execa(npm, ['install', '-D', '@sveltejs/adapter-cloudflare'], { stdio: 'inherit' });
	
	await updateSvelteConfig();
}

async function updateSvelteConfig(): Promise<void> {
	if (!existsSync('svelte.config.js')) return;

	let content = readFileSync('svelte.config.js', 'utf8');
	
	// Update adapter import and usage
	content = content.replace(
		/@sveltejs\/adapter-auto/g,
		'@sveltejs/adapter-cloudflare'
	);
	
	writeFileSync('svelte.config.js', content);
	logger.log("Updated svelte.config.js");
}

async function setupAngular(): Promise<void> {
	logger.log("Angular Cloudflare setup requires manual configuration.");
	logger.log("Please refer to: https://developers.cloudflare.com/workers/frameworks/angular/");
}

async function setupRemix(): Promise<void> {
	const { npm } = detectPackageManager();
	
	logger.log("Installing Remix Cloudflare adapter...");
	await execa(npm, ['install', '@remix-run/cloudflare'], { stdio: 'inherit' });
}

async function setupReactRouter(): Promise<void> {
	const { npm } = detectPackageManager();

	logger.log("Installing React Router Cloudflare adapter...");
	await execa(npm, ['install', '@react-router/cloudflare'], { stdio: 'inherit' });
}

async function setupNodeServer(projectRoot?: string): Promise<void> {
	logger.log("Adapting Node.js HTTP server for Cloudflare Workers...");

	const root = projectRoot || process.cwd();

	// Find the server file
	const serverFiles = [
		'src/server.ts',
		'src/server.js',
		'server.ts',
		'server.js',
		'src/index.ts',
		'src/index.js',
		'index.ts',
		'index.js'
	];

	let serverFilePath: string | null = null;
	for (const file of serverFiles) {
		if (existsSync(`${root}/${file}`)) {
			serverFilePath = `${root}/${file}`;
			break;
		}
	}

	if (!serverFilePath) {
		logger.warn("Could not find server file to adapt");
		return;
	}

	logger.log(`Adapting ${serverFilePath.replace(root + '/', '')} for Cloudflare Workers...`);

	try {
		let content = readFileSync(serverFilePath, 'utf-8');

		// Add the cloudflare:node import at the top
		const cloudflareImport = "import { httpServerHandler } from 'cloudflare:node';\n";

		// Check if import already exists
		if (!content.includes("from 'cloudflare:node'")) {
			// Add import after other imports or at the beginning
			const importRegex = /^((?:import.*;\n)*)/m;
			const match = content.match(importRegex);

			if (match) {
				content = content.replace(importRegex, match[0] + cloudflareImport);
			} else {
				content = cloudflareImport + content;
			}
		}

		// Find the port number used in server.listen()
		const listenMatch = content.match(/\.listen\s*\(\s*(\d+|[a-zA-Z_$][\w$]*)\s*[,)]/);
		let port = '8080'; // Default port

		if (listenMatch) {
			port = listenMatch[1];

			// If port is a variable, try to find its value
			if (isNaN(parseInt(port))) {
				const portVarMatch = content.match(new RegExp(`(?:const|let|var)\\s+${port}\\s*=\\s*(\\d+)`));
				if (portVarMatch) {
					port = portVarMatch[1];
				}
			}
		}

		// Add the export default at the end if not already present
		if (!content.includes('httpServerHandler')) {
			content += `\n\nexport default httpServerHandler({ port: ${port} });\n`;
		}

		// Write the modified content back
		writeFileSync(serverFilePath, content, 'utf-8');
		logger.log(`Successfully adapted ${serverFilePath.replace(root + '/', '')}`);

	} catch (error) {
		logger.warn(`Failed to adapt server file: ${error}`);
		throw error;
	}
}

async function buildProject(): Promise<void> {
	const { npm } = detectPackageManager();
	
	// Check if build script exists
	if (!existsSync('package.json')) {
		return;
	}

	const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
	
	// Special handling for Next.js - use OpenNext build
	if (packageJson.dependencies?.next && packageJson.dependencies?.['@opennextjs/cloudflare']) {
		logger.log("Building Next.js project with OpenNext...");
		try {
			await execa('npx', ['opennextjs-cloudflare', 'build'], { 
				stdio: 'inherit',
				timeout: 120000
			});
			logger.log("OpenNext build completed successfully");
			return;
		} catch (error) {
			logger.warn("OpenNext build failed:", error);
			throw error;
		}
	}
	
	// Regular build process for other frameworks
	if (!packageJson.scripts?.build) {
		logger.debug("No build script found, skipping build step");
		return;
	}

	logger.log("Building project...");
	try {
		await execa(npm, ['run', 'build'], { 
			stdio: 'inherit',
			timeout: 120000 // 2 minute timeout for build
		});
		logger.log("Project built successfully");
		
		// After build completes, create .assetsignore for Astro SSR
		await createAssetsIgnoreAfterBuild();
		
	} catch (error) {
		logger.warn("Build failed, but continuing with deployment");
		throw error;
	}
}

async function createAssetsIgnoreAfterBuild(): Promise<void> {
	try {
		// Check if this is an Astro SSR build
		if (existsSync('dist/_worker.js')) {
			const assetsIgnorePath = 'dist/.assetsignore';
			const assetsIgnoreContent = '_worker.js\n_routes.json';
			
			writeFileSync(assetsIgnorePath, assetsIgnoreContent);
			logger.log('Created .assetsignore in dist/ directory');
		}
	} catch (error) {
		logger.debug('Could not create .assetsignore file:', error);
	}
}
