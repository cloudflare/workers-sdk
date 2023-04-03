set -eu
# The upstream VSCode version (tag) to build from
VERSION=1.76.0

cd ..
rm -f $PWD/quick-edit/web/cloudflare-logic
ln -s $PWD/cloudflare-logic $PWD/quick-edit/web/cloudflare-logic

cd quick-edit
git clone --depth 1 --branch "$VERSION" https://github.com/microsoft/vscode

cd vscode
git checkout -b base
git checkout -b cloudflare
git config user.email "workers-devprod@cloudflare.com"
git config user.name "Workers DevProd"

git am ../patches/*.patch
