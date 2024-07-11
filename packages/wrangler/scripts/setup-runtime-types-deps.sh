set -eu

rm -rf .workerd
cd .workerd
git clone git@github.com:cloudflare/workerd.git
cd workerd

# bazel-bin/src/workerd/server/workerd
bazel build //src/workerd/server:workerd

# bazel-bin/types/dist/index.mjs
bazel build //types:types_worker

# Make assets available to wrangler
cp bazel-bin/src/workerd/server/workerd ../../src/type-generation-runtime/worker/workerd
cp bazel-bin/types/dist/index.mjs ../../src/type-generation-runtime/worker/types-worker.mjs
