export interface FrameworkConfig {
	name: string;
	detection: {
		configFiles?: string[];
		dependencies?: string[];
		staticFiles?: string[];
	};
	build: {
		command: string;
		outputDir: string;
	};
	deploy: {
		type: 'static' | 'ssr' | 'hybrid';
		adapter?: string;
		compatibility_flags?: string[];
		main?: string;
		assets?: {
			binding?: string;
			directory?: string;
		};
	};
	dev?: {
		command: string;
		port?: number;
	};
	// C3 template mappings for adapter installation
	c3Config?: {
		templateId: string;
		frameworkCli?: string;
		packages?: string[];
		configFiles?: Array<{
			path: string;
			content: string;
		}>;
	};
}

export const FRAMEWORKS: FrameworkConfig[] = [
	{
		name: 'angular',
		detection: {
			configFiles: ['angular.json'],
			dependencies: ['@angular/core', '@angular/cli']
		},
		build: {
			command: 'npm run build',
			outputDir: 'dist'
		},
		deploy: {
			type: 'ssr',
			compatibility_flags: ['nodejs_compat'],
			main: './dist/server/server.mjs',
			assets: {
				binding: 'ASSETS',
				directory: './dist/browser'
			}
		},
		dev: {
			command: 'npm run dev',
			port: 4200
		},
		c3Config: {
			templateId: 'angular',
			packages: ['@angular/platform-server', '@angular/ssr']
		}
	},
	{
		name: 'nuxt',
		detection: {
			configFiles: ['nuxt.config.ts', 'nuxt.config.js'],
			dependencies: ['nuxt', '@nuxt/kit']
		},
		build: {
			command: 'npm run build',
			outputDir: '.output'
		},
		deploy: {
			type: 'ssr',
			compatibility_flags: ['nodejs_compat'],
			main: './.output/server/index.mjs',
			assets: {
				binding: 'ASSETS',
				directory: './.output/public/'
			}
		},
		dev: {
			command: 'npm run dev',
			port: 3000
		},
		c3Config: {
			templateId: 'nuxt',
			packages: ['nitro-cloudflare-dev', 'nitropack', 'h3'],
			configFiles: [
				{
					path: 'env.d.ts',
					content: `/// <reference types="./worker-configuration.d.ts" />

declare module "h3" {
  interface H3EventContext {
    cf: CfProperties;
    cloudflare: {
      request: Request;
      env: Env;
      context: ExecutionContext;
    };
  }
}

export {};`
				}
			]
		}
	},
	{
		name: 'nextjs',
		detection: {
			configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
			dependencies: ['next']
		},
		build: {
			command: 'npm run build',
			outputDir: '.open-next'
		},
		deploy: {
			type: 'ssr',
			compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
			main: '.open-next/worker.js',
			assets: {
				binding: 'ASSETS',
				directory: '.open-next/assets'
			}
		},
		dev: {
			command: 'npm run dev',
			port: 3000
		},
		c3Config: {
			templateId: 'next',
			packages: ['@opennextjs/cloudflare@^1.3.0'],
			configFiles: [
				{
					path: 'open-next.config.ts',
					content: `import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Uncomment to enable R2 cache,
  // It should be imported as:
  // \`import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";\`
  // See https://opennext.js.org/cloudflare/caching for more details
  // incrementalCache: r2IncrementalCache,
});`
				}
			]
		}
	},
	{
		name: 'astro',
		detection: {
			configFiles: ['astro.config.mjs', 'astro.config.js', 'astro.config.ts'],
			dependencies: ['astro']
		},
		build: {
			command: 'npm run build',
			outputDir: 'dist'
		},
		deploy: {
			type: 'ssr',
			adapter: '@astrojs/cloudflare',
			compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
			main: './dist/_worker.js/index.js',
			assets: {
				binding: 'ASSETS',
				directory: './dist'
			}
		},
		dev: {
			command: 'npm run dev',
			port: 4321
		},
		c3Config: {
			templateId: 'astro',
			frameworkCli: 'create-astro'
		}
	},
	{
		name: 'svelte',
		detection: {
			configFiles: ['svelte.config.js'],
			dependencies: ['svelte', '@sveltejs/kit']
		},
		build: {
			command: 'npm run build',
			outputDir: '.svelte-kit/cloudflare'
		},
		deploy: {
			type: 'ssr',
			adapter: '@sveltejs/adapter-cloudflare',
			compatibility_flags: ['nodejs_als'],
			main: '.svelte-kit/cloudflare/_worker.js',
			assets: {
				binding: 'ASSETS',
				directory: '.svelte-kit/cloudflare'
			}
		},
		dev: {
			command: 'npm run dev',
			port: 5173
		},
		c3Config: {
			templateId: 'svelte',
			frameworkCli: 'sv',
			packages: ['@sveltejs/adapter-cloudflare']
		}
	},
	{
		name: 'react-router',
		detection: {
			configFiles: ['react-router.config.ts', 'react-router.config.js'],
			dependencies: ['react-router', '@react-router/dev']
		},
		build: {
			command: 'npm run build',
			outputDir: 'build'
		},
		deploy: {
			type: 'ssr',
			compatibility_flags: ['nodejs_compat'],
			main: './build/server/index.js',
			assets: {
				binding: 'ASSETS',
				directory: './build/client'
			}
		},
		dev: {
			command: 'npm run dev',
			port: 3000
		},
		c3Config: {
			templateId: 'react-router',
			packages: ['@react-router/cloudflare']
		}
	},
	{
		name: 'remix',
		detection: {
			configFiles: ['remix.config.js'],
			dependencies: ['@remix-run/node', '@remix-run/react']
		},
		build: {
			command: 'npm run build',
			outputDir: 'build'
		},
		deploy: {
			type: 'ssr',
			compatibility_flags: ['nodejs_compat'],
			main: './build/server/index.js',
			assets: {
				binding: 'ASSETS',
				directory: './build/client'
			}
		},
		dev: {
			command: 'npm run dev',
			port: 3000
		},
		c3Config: {
			templateId: 'remix',
			packages: ['@remix-run/cloudflare']
		}
	},
	{
		name: 'react',
		detection: {
			configFiles: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'],
			dependencies: ['vite', 'react']
		},
		build: {
			command: 'npm run build',
			outputDir: 'dist'
		},
		deploy: {
			type: 'static'
		},
		dev: {
			command: 'npm run dev',
			port: 5173
		},
		c3Config: {
			templateId: 'react',
			frameworkCli: 'create-vite'
		}
	},
	{
		name: 'static',
		detection: {
			staticFiles: ['index.html']
		},
		build: {
			command: '', // No build needed
			outputDir: '.'
		},
		deploy: {
			type: 'static'
		},
		dev: {
			command: '', // No dev server for static sites
			port: 8080
		}
	}
];

// Helper functions for framework detection
export function getFrameworkByName(name: string): FrameworkConfig | undefined {
	return FRAMEWORKS.find(f => f.name === name);
}

export function getSSRFrameworks(): FrameworkConfig[] {
	return FRAMEWORKS.filter(f => f.deploy.type === 'ssr');
}

export function getStaticFrameworks(): FrameworkConfig[] {
	return FRAMEWORKS.filter(f => f.deploy.type === 'static');
}

// Framework-specific configuration helpers
export function requiresAdapter(framework: FrameworkConfig): boolean {
	return !!framework.deploy.adapter;
}

export function getCompatibilityFlags(framework: FrameworkConfig): string[] {
	return framework.deploy.compatibility_flags || [];
}

export function getMainEntryPoint(framework: FrameworkConfig): string | undefined {
	return framework.deploy.main;
}

export function getAssetsConfig(framework: FrameworkConfig) {
	return framework.deploy.assets;
}
