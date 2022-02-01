const { argv, exit } = require("process");
const { fetch } = require("undici");

const [pullRequestNumber, pullRequestHeadRef] = argv.slice(2);

const fail = (message) => {
  console.error(message);
  exit(1);
};

const tag = `${pullRequestNumber}-${pullRequestHeadRef}`;

(async () => {
  try {
    const response = await fetch(
      `https://prerelease-registry.developers.workers.dev/delete/${tag}`,
      {
        method: "DELETE",
      }
    );
    if (response.ok) {
      console.log("Successfully deleted.");
      return;
    }

    console.error(
      `Could not delete package: ${response.statusCode} ${response.statusMessage}.`
    );
    fail(await response.text());
  } catch (thrown) {
    console.error("Could not make request to delete package.");
    fail(thrown);
  }
})();
