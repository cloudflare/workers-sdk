set -eu
# The upstream VSCode version (tag) to build from
VERSION=1.76.0

rm -rf web
mkdir -p web
cd ..
ln -s $PWD/quick-edit-extension $PWD/quick-edit/web/quick-edit-extension

cd quick-edit
git clone --depth 1 --branch "$VERSION" https://github.com/microsoft/vscode

cd vscode
git checkout -b base
git checkout -b cloudflare
git config user.email "workers-devprod@cloudflare.com"
git config user.name "Workers DevProd"

git am ../patches/*.patch
cd ..
ln -s $PWD/vscode $PWD/web/vscode
