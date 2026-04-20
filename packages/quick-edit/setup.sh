set -eu

# Quick Edit requires Node 22 because it builds native modules (tree-sitter)
# that are not compatible with Node 24's C++20 requirement for V8 headers.
NODE_MAJOR_VERSION=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR_VERSION" != "22" ]; then
    echo "Error: Quick Edit requires Node.js 22, but found $(node -v)"
    echo "Please switch to Node 22 before running this script."
    exit 1
fi

# The upstream VSCode version (tag) to build from
VERSION="1.102.1"

# Setup for the CI environment
# if [ -n "${CI:-}" ]; then
#     sudo apt-get install -y libkrb5-dev
#     yarn global add node-gyp
# fi

rm -rf web
rm -rf ../../vendor/vscode
mkdir -p web
cd ..
ln -s $PWD/quick-edit-extension $PWD/quick-edit/web/quick-edit-extension
ln -s $PWD/solarflare-theme $PWD/quick-edit/web/solarflare-theme
cd quick-edit-extension
pnpm dlx vscode-dts dev $VERSION
pnpm dlx vscode-dts $VERSION

cd ../quick-edit
git clone --branch "$VERSION" --depth 1 https://github.com/microsoft/vscode ../../vendor/vscode

cd ../../vendor/vscode
git checkout -b base
git checkout -b cloudflare
git config user.email "workers-devprod@cloudflare.com"
git config user.name "Workers DevProd"

git apply ../../packages/quick-edit/patches/*.diff

npm install
cd ../../packages/quick-edit
pnpm exec tsx bundle-dts.ts
