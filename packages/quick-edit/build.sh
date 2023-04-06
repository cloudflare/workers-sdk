set -eu

# Cleanup development symlink to vscode
rm -f web/vscode

# See https://unix.stackexchange.com/questions/30091/fix-or-alternative-for-mktemp-in-os-x
BUILD_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'vscode-build')
DIR=$(pwd)

# Isolate the from the workers-sdk environment to ensure a clean build
cp -r vscode $BUILD_DIR/vscode

cd $BUILD_DIR/vscode
yarn

# Build vscode
yarn gulp vscode-web-min

cd $DIR

mv $BUILD_DIR/vscode-web web/assets
# Pages doesn't support uploading folders called node_modules
mv web/assets/node_modules web/assets/modules

# Build quick-edit-extension
npm --prefix web/quick-edit-extension run package-web
