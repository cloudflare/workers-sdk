import { defineConfig } from 'tsup';

export default defineConfig([
	{
		entry: ['src/index.ts'],
		format: 'esm',
		platform: 'node',
		dts: true,
		outDir: 'dist',
	},
	{
		entry: ['src/runner/worker.ts'],
		format: 'esm',
		platform: 'neutral',
		outDir: 'dist/runner',
		noExternal: ['vite/module-runner'],
	},
]);
