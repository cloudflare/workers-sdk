set -e

mkdir -p build

export EM_ARGS=""
# by default we build in debugging. If you want to make your worker smaller and
# faster replace `-g3` with `-O3`.
EM_ARGS+=" -g3"
EM_ARGS+=" -s ASSERTIONS=0"
EM_ARGS+=" -s ALLOW_MEMORY_GROWTH=1"
EM_ARGS+=" -s ENVIRONMENT='web'"

export EM_OUT=/build/out.js

docker run \
  -e EM_OUT \
  -e EM_ARGS \
  -v /tmp/cobol-worker:/root/.emscripten_cache/ \
  -v $PWD:/worker \
  -v $PWD/build:/build \
  xtuc/cobaul \
  /worker/src/worker.cob

sed -i.bu 's/import\.meta/({})/' build/out.js
echo "$(cat src/pre.js);$(cat build/out.js)" > build/out.js
