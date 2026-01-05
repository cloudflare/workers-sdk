import childProcess from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import https from "node:https";
import { AddressInfo } from "node:net";
import path from "node:path";
import { text } from "node:stream/consumers";
import tls from "node:tls";
import stoppable from "stoppable";
import { expect, onTestFinished, test } from "vitest";
import which from "which";
import { useTmp } from "../../test-shared";

const opensslInstalled = which.sync("openssl", { nothrow: true });
const opensslTest = opensslInstalled ? test : test.skip;
opensslTest("NODE_EXTRA_CA_CERTS: loads certificates", async () => {
	const tmp = await useTmp();

	// Generate self-signed certificate
	childProcess.execSync(
		'openssl req -newkey rsa:2048 -nodes -keyout key.pem -x509 -days 30 -out cert.pem -subj "/CN=localhost"',
		{ cwd: tmp, stdio: "ignore" }
	);
	const keyPath = path.join(tmp, "key.pem");
	const certPath = path.join(tmp, "cert.pem");
	const key = await fs.readFile(keyPath);
	const cert = await fs.readFile(certPath);

	// Start HTTPS server with self-signed certificate
	const responseBody = "secure body";
	const server = https.createServer({ key, cert }, (req, res) => {
		res.end(responseBody);
	});
	const stoppableServer = stoppable(server, /* grace */ 0);
	const url = await new Promise<string>((resolve) => {
		server.listen(0, () => {
			onTestFinished(() => {
				return new Promise((resolve, reject) =>
					stoppableServer.stop((err) => (err ? reject(err) : resolve()))
				);
			});
			const port = (server.address() as AddressInfo).port;
			resolve(`https://localhost:${port}`);
		});
	});

	// Write NODE_EXTRA_CA_CERTS file, with multiple certificates
	// (see https://github.com/cloudflare/miniflare/pull/587/files#r1271579671)
	const caCertsPath = path.join(tmp, "bundle.pem");
	const caCerts = [...tls.rootCertificates, cert];
	await fs.writeFile(
		caCertsPath,
		["## This is a comment which should be ignored\n"].concat(
			caCerts.join("\n")
		)
	);

	// Start Miniflare with NODE_EXTRA_CA_CERTS environment variable
	// (cannot use sync process methods here as that would block HTTPS server)
	const miniflarePath = require.resolve("miniflare");
	const result = childProcess.spawn(
		process.execPath,
		[
			"-e",
			`
      const { Miniflare } = require(${JSON.stringify(miniflarePath)});
      const mf = new Miniflare({
        modules: true,
        script: \`export default {
          fetch() {
            return fetch(${JSON.stringify(url)});
          }
        }\`
      });
      (async () => {
        const res = await mf.dispatchFetch("http://placeholder/");
        const text = await res.text();
        console.log(text);
        await mf.dispose();
      })();
      `,
		],
		{
			stdio: [/* in */ "ignore", /* out */ "pipe", /* error */ "inherit"],
			env: { NODE_EXTRA_CA_CERTS: caCertsPath },
		}
	);

	// Check response matches expected
	const exitPromise = once(result, "exit");
	const resultText = await text(result.stdout);
	await exitPromise;
	expect(result.exitCode).toBe(0);
	expect(resultText.trim()).toBe(responseBody);
});
