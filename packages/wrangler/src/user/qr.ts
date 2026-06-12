// This file exists so wrangler's tests can `vi.mock("../user/qr", ...)` to
// produce a deterministic QR placeholder for snapshot testing. The mocked
// export is imported by `./user.ts` and injected into the OAuth flow context,
// where the workers-auth package uses it internally to render the device-flow
// verification QR code (RFC 8628).
export { renderDeviceQrCode } from "@cloudflare/workers-auth";
