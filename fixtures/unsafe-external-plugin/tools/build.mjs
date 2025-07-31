// @ts-check
import { build } from 'esbuild'
import { join, resolve } from 'node:path'
// @ts-expect-error TODO: Need to fix this error
import { embedWorkersPlugin } from 'miniflare-shared'


const distDir = resolve(import.meta.dirname, '../dist')
// When outputting the Worker, map to the structure of 'src'.
// This means the plugin will outout the build Workers to a `workers` dist in `dir`
const workerOutputDir = resolve(distDir, 'workers')
const workersDir = resolve(import.meta.dirname, '../src/workers')

export async function buildPackage() {
    console.log("Building the module")
    await build({
        platform: "node",
        target: "esnext",
        format: 'cjs',
        bundle: true,
        sourcemap: true,
        entryPoints: ['src/index.ts'],
        plugins: [embedWorkersPlugin({
            workersRootDir: workersDir,
            workerOutputDir,
            writeMetafiles: false,
        })],
        // Users of this plugin will need to have miniflare:shared installed
        external: ['@cloudflare/workers-types', 'miniflare', 'miniflare-shared'],
        outdir: distDir,
    })
}

buildPackage().catch(
    (exc) => {
        console.error("Failed to build external package", `${exc}`)
    }
)