set -eu

# Cleanup development symlink to vscode
rm -f web/assets

yarn --cwd ../../vendor/vscode

# Build vscode
yarn --cwd ../../vendor/vscode gulp vscode-web-min

mv ../../vendor/vscode-web web/assets
# Pages doesn't support uploading folders called node_modules
mv web/assets/node_modules web/assets/modules

# Build quick-edit-extension
pnpm --filter quick-edit-extension run package-web
