import { test, vi } from "vitest";
import { getTextResponse, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test("crypto.X509Certificate is implemented", async ({ expect }) => {
	await vi.waitFor(async () => {
		expect(await getTextResponse()).toMatchInlineSnapshot(`
	""OK!": -----BEGIN CERTIFICATE-----
	MIICZjCCAc+gAwIBAgIUOsv8Y+x40C+gdNuu40N50KpGUhEwDQYJKoZIhvcNAQEL
	BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
	GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNDA5MjAwOTA4MTNaFw0yNTA5
	MjAwOTA4MTNaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
	HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwgZ8wDQYJKoZIhvcNAQEB
	BQADgY0AMIGJAoGBALpJn3dUrNmZhZV02RbjZKTd5j3hpgTncF4lG4Y3sQA18k0l
	7pt6xpZuXYSFH7v2zTAxYy+uYyYwX2NZur48dZc76FSzIeuQdoTCkT0NacwFRTR5
	fEEqPvvB85ozYuyk8Bl3vSsonivOH3WftEDp9mjkHROQzS4wAZbIj7Cp+is/AgMB
	AAGjUzBRMB0GA1UdDgQWBBSzFJSiPAw2tJOg8oUXrFBdqWI6zDAfBgNVHSMEGDAW
	gBSzFJSiPAw2tJOg8oUXrFBdqWI6zDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3
	DQEBCwUAA4GBACbto0+Ds40F7faRFFMwg5nPyh7gsiX+ZK3FYcrO3oxh5ejfzwow
	DKOOje4Ncaw0rIkVpxacPyjg+wANuK2Nv/Z4CVAD3mneE4gwgRdn38q8IYN9AtSv
	GzEf4UxiLBbUB6WRBgyVyquGfUMlKl/tnm4q0yeYQloYKSoHpGeHVJuN
	-----END CERTIFICATE-----
	"
	`);
	}, WAIT_FOR_OPTIONS);
});
