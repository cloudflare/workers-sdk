import { maybeBuildContainer } from "../../cloudchamber/deploy";

describe("maybeBuildContainer", () => {
	it("Should return imageUpdate: true if using an image URI", async () => {
		const config = {
			image: "registry.cloudflare.com/some-account-id/some-image:uri",
			class_name: "Test",
		};
		const result = await maybeBuildContainer(
			config,
			"some-tag:thing",
			false,
			"/usr/bin/docker"
		);
		expect(result.image).toEqual(config.image);
		expect(result.imageUpdated).toEqual(true);
	});
});
