const fs = require("fs");

const distCLI = "./packages/wrangler/wrangler-dist/cli.js";
const sourceMapURLPattern = /\/\/# sourceMappingURL=(.*)/;
const sourceMap = fs.readFileSync(distCLI, "utf-8");

const sourceMappingURLExists = sourceMapURLPattern.test(sourceMap);

if (sourceMappingURLExists) {
  fs.writeFileSync(
    distCLI,
    sourceMap.replace(sourceMapURLPattern, "//# sourceMappingURL=/cli.js.map")
  );
} else {
  fs.appendFileSync(distCLI, `//# sourceMappingURL=/cli.js.map`);
}
