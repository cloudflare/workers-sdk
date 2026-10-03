import { describe, it } from "vitest";
import { CodexMicroProtocol } from "../../codex-micro/protocol";

describe("CodexMicroProtocol", () => {
	it("reassembles compact HID notifications across reports", ({ expect }) => {
		const protocol = new CodexMicroProtocol();
		const message =
			'{"m":"v.oai.hid","p":{"k":"AG02","act":1,"ag":2},"padding":"xxxxxxxxxxxxxxxxxxxxxxxx"}\n';
		const bytes = Buffer.from(message);
		const firstReport = createReport(bytes.subarray(0, 61));
		const secondReport = createReport(bytes.subarray(61));

		expect(protocol.pushReport(firstReport)).toEqual([]);
		expect(protocol.pushReport(secondReport)).toEqual([
			{ key: "AG02", action: 1, agent: 2 },
		]);
	});

	it("accepts long-form JSON-RPC notifications", ({ expect }) => {
		const protocol = new CodexMicroProtocol();
		const report = createReport(
			Buffer.from('{"method":"v.oai.hid","params":{"k":"AG05"}}\n')
		);

		expect(protocol.pushReport(report)).toEqual([{ key: "AG05" }]);
	});

	it("accepts rotary turn and press notifications", ({ expect }) => {
		const protocol = new CodexMicroProtocol();
		const messages = [
			'{"m":"v.oai.hid","p":{"k":"ENC_CW","act":2}}\n',
			'{"m":"v.oai.hid","p":{"k":"ENC_CC","act":2}}\n',
			'{"m":"v.oai.hid","p":{"k":"ENC","act":1}}\n',
		];

		expect(
			messages.flatMap((message) =>
				protocol.pushReport(createReport(Buffer.from(message)))
			)
		).toEqual([
			{ key: "ENC_CW", action: 2 },
			{ key: "ENC_CC", action: 2 },
			{ key: "ENC", action: 1 },
		]);
	});

	it("ignores other channels, malformed reports, and unknown keys", ({
		expect,
	}) => {
		const protocol = new CodexMicroProtocol();
		const debugReport = createReport(
			Buffer.from('{"m":"v.oai.hid","p":{"k":"AG00"}}\n'),
			1
		);
		const unknownKeyReport = createReport(
			Buffer.from('{"m":"v.oai.hid","p":{"k":"AG06"}}\n')
		);
		const primitiveReport = createReport(Buffer.from("null\n"));

		expect(protocol.pushReport(debugReport)).toEqual([]);
		expect(protocol.pushReport(Buffer.from([6, 2, 62]))).toEqual([]);
		expect(protocol.pushReport(unknownKeyReport)).toEqual([]);
		expect(protocol.pushReport(primitiveReport)).toEqual([]);
	});
});

function createReport(payload: Buffer, channel = 2): Buffer {
	const report = Buffer.alloc(64);
	report[0] = 6;
	report[1] = channel;
	report[2] = payload.length;
	payload.copy(report, 3);
	return report;
}
