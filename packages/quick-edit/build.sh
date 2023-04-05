set -eu

# Cleanup development symlink to vscode
rm -f web/vscode

# Build vscode
yarn --cwd vscode gulp vscode-web-min
mv vscode-web web/assets
# Pages doesn't support uploading folders called node_modules
mv web/assets/node_modules web/assets/modules

# Build quick-edit-extension
npm --prefix web/quick-edit-extension run package-web
