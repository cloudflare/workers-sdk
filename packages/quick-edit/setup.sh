set -euf -o pipefail
# The upstream VSCode version (tag) to build from
VERSION=1.76.0

git clone --depth 1 --branch "$VERSION" https://github.com/microsoft/vscode
cd vscode
yarn
yarn gulp vscode-web-min
cd ..
mv vscode-web web/assets
# Pages doesn't support uploading folders called node_modules
mv web/assets/node_modules web/assets/modules
