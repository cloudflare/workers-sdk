set -eu

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
