import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("nodejs compat", () => {
	it("should work when running code requiring polyfills", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerDev(
			resolve(__dirname, "../src"),
			["--port=0", "--inspector-port=0"]
		);
		try {
			const response = await fetch(`http://${ip}:${port}`);
			await expect(response.text()).resolves.toMatchInlineSnapshot(
				`"{"id":"1","timestamp":"2017-04-30T23:00:00.000Z","userstamp":"RNACEN","descr":"ENA","current_release":884,"full_descr":"ENA","alive":"Y","for_release":" ","display_name":"ENA","project_id":"","avg_length":"412","min_length":"10","max_length":"900074","num_sequences":"12086180","num_organisms":"814855","description":"provides a comprehensive record of the world's nucleotide sequencing information","url":"https://www.ebi.ac.uk/ena/browser/","example":[{"upi":"URS00002D0E0C","taxid":10090},{"upi":"URS000035EE7E","taxid":9606},{"upi":"URS0000000001","taxid":77133}],"reference":[{"title":"The European Nucleotide Archive in 2017","authors":"Silvester et al.","journal":"Nucleic Acids Res. 2017","pubmed_id":"29140475"}]}"`
			);
		} finally {
			await stop();
		}
	});
});
