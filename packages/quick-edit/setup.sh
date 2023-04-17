set -eu
# The upstream VSCode version (tag) to build from
VERSION=1.76.0

rm -rf web
rm -rf ../../vendor/vscode
mkdir -p web
cd ..
ln -s $PWD/quick-edit-extension $PWD/quick-edit/web/quick-edit-extension
ln -s $PWD/solarflare-theme $PWD/quick-edit/web/solarflare-theme

cd quick-edit-extension
npx vscode-dts dev 1.76.0
npx vscode-dts 1.76.0

cd ../quick-edit
git clone --depth 1 --branch "$VERSION" https://github.com/microsoft/vscode ../../vendor/vscode

cd ../../vendor/vscode
git checkout -b base
git checkout -b cloudflare
git config user.email "workers-devprod@cloudflare.com"
git config user.name "Workers DevProd"

git am ../../packages/quick-edit/patches/*.patch
yarn
cd ../../packages/quick-edit
