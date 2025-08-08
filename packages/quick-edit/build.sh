set -eu

# Build vscode
npm --prefix ../../vendor/vscode run gulp vscode-web-min

# Move the output assets to the assets direcotry for the `quick-edit` Worker
mv ../../vendor/vscode-web web/assets

pnpm esbuild editor-files/workbench.ts --outfile=web/assets/workbench.js

cp editor-files/workbench.html web/assets

# Build quick-edit-extension
pnpm --filter quick-edit-extension run package-web
