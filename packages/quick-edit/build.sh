set -eu

# The preinstall script in vscode will fail if npm_execpath is not set by yarn
# This make sure the env is unset so yarn can set it accordingly
unset npm_execpath
# We cannot run yarn without disabling the corepack check as the packageManager field is set to pnpm
SKIP_YARN_COREPACK_CHECK=0

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
