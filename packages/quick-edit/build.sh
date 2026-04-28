set -eu

cd ../../vendor/vscode

# Build vscode
node --max-old-space-size=30000 ./node_modules/gulp/bin/gulp.js vscode-web-min

# Move the output assets to the assets directory for the `quick-edit` Worker
mv ../vscode-web ../../packages/quick-edit/web/assets

cd ../../packages/quick-edit

pnpm esbuild editor-files/workbench.ts --outfile=web/assets/workbench.js

cp editor-files/workbench.html web/assets

# Build quick-edit-extension
pnpm --filter quick-edit-extension run package-web
