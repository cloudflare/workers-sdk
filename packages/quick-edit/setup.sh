set -euf -o pipefail
# The upstream VSCode version (tag) to build from
VERSION=1.76.0

git clone --depth 1 --branch "$VERSION" https://github.com/microsoft/vscode
cd vscode
yarn
yarn gulp vscode-web-min
cd ..
mkdir dist
mv vscode-web dist/assets
# Pages doesn't support uploading folders called node_modules
mv dist/assets/node_modules dist/assets/modules
