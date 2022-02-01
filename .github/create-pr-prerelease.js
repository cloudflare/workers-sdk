const { argv, exit } = require("process");
const { readFileSync } = require("fs");
const { resolve } = require("path");
const { FormData, File, fetch } = require("undici");

const [pullRequestNumber, pullRequestHeadRef, sha, packageName, filePath] =
  argv.slice(2);

const fail = (message) => {
  console.error(message);
  exit(1);
};

const tag = `${pullRequestNumber}-${pullRequestHeadRef}`;
const version = sha;

const formData = new FormData();
formData.append("tag", tag);
formData.append("version", version);
formData.append(
  "file",
  new File(readFileSync(resolve(filePath)), `${packageName}.tgz`)
);

(async () => {
  try {
    const response = await fetch(
      `https://prerelease-registry.developers.workers.dev/upload`,
      {
        method: "POST",
        body: formData,
      }
    );
    if (response.ok) {
      console.log("Successfully uploaded.");
      console.log("");
      console.log(
        `npm install https://prerelease-registry.developers.workers.dev/download/${tag}/${version}/${packageName}.tgz`
      );
      console.log("");
      return;
    }

    console.error(
      `Could not upload package: ${response.status} ${response.statusText}.`
    );
    fail(await response.text());
  } catch (thrown) {
    console.error("Could not make request to upload package.");
    fail(thrown);
  }
})();
