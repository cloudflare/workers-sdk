import fs from "node:fs/promises";
import path from "node:path";
import { describe, test, vi } from "vitest";
import { ensureSecretsStoreDirectory } from "../../../src/plugins/secret-store/persistence";
import { useTmp } from "../../test-shared";

// POSIX permission assertions do not describe Windows' inherited ACLs.
describe.runIf(process.platform !== "win32")(
	"Secrets Store persistence boundary",
	() => {
		test("resolves a configured parent alias without restricting it", async ({
			expect,
		}) => {
			const root = await useTmp();
			const parent = path.join(root, "parent");
			const alias = path.join(root, "alias");
			await fs.mkdir(parent);
			await fs.chmod(parent, 0o755);
			await fs.symlink(parent, alias);
			const secured = await ensureSecretsStoreDirectory(
				path.join(alias, "secrets-store")
			);
			expect(secured).toBe(
				path.join(await fs.realpath(parent), "secrets-store")
			);
			expect((await fs.stat(secured)).mode & 0o777).toBe(0o700);
			expect((await fs.stat(parent)).mode & 0o777).toBe(0o755);
		});

		test.for([false, true])(
			"rejects a symlink without changing its target (dangling: %s)",
			async (dangling, { expect }) => {
				const root = await useTmp();
				const target = path.join(root, "target");
				const store = path.join(root, "secrets-store");
				if (!dangling) {
					await fs.mkdir(target);
					await fs.chmod(target, 0o755);
				}
				await fs.symlink(target, store);
				await expect(ensureSecretsStoreDirectory(store)).rejects.toMatchObject({
					cause: {
						message:
							"The Secrets Store directory must not be a symlink or file.",
					},
				});
				if (!dangling) {
					expect((await fs.stat(target)).mode & 0o777).toBe(0o755);
				} else {
					await expect(fs.stat(target)).rejects.toMatchObject({
						code: "ENOENT",
					});
				}
			}
		);

		test("rejects a file without changing its permissions", async ({
			expect,
		}) => {
			const root = await useTmp();
			const store = path.join(root, "secrets-store");
			await fs.writeFile(store, "dummy-value");
			await fs.chmod(store, 0o644);
			await expect(ensureSecretsStoreDirectory(store)).rejects.toThrow(
				"Unable to secure Secrets Store"
			);
			expect((await fs.stat(store)).mode & 0o777).toBe(0o644);
			expect(await fs.readFile(store, "utf8")).toBe("dummy-value");
		});

		test("checks ownership before changing permissions", async ({ expect }) => {
			const root = await useTmp();
			const store = path.join(root, "secrets-store");
			await fs.mkdir(store);
			await fs.chmod(store, 0o755);
			const owner = (await fs.stat(store)).uid;
			// Simulate a different effective UID without chown or privileged processes.
			const uid = vi.spyOn(process, "geteuid").mockReturnValue(owner + 1);
			try {
				await expect(ensureSecretsStoreDirectory(store)).rejects.toMatchObject({
					cause: {
						message:
							"The Secrets Store directory must be owned by the current user.",
					},
				});
				expect((await fs.stat(store)).mode & 0o777).toBe(0o755);
			} finally {
				uid.mockRestore();
			}
		});

		test("does not follow a symlink substituted before open", async ({
			expect,
		}) => {
			const root = await useTmp();
			const store = path.join(root, "secrets-store");
			const target = path.join(root, "target");
			await fs.mkdir(store);
			await fs.mkdir(target);
			await fs.chmod(target, 0o755);
			const open = fs.open;
			const spy = vi
				.spyOn(fs, "open")
				.mockImplementationOnce(async (file, flags) => {
					await fs.rename(store, path.join(root, "original"));
					await fs.symlink(target, store);
					return open(file, flags);
				});
			try {
				await expect(ensureSecretsStoreDirectory(store)).rejects.toThrow(
					"Unable to secure Secrets Store"
				);
				expect((await fs.stat(target)).mode & 0o777).toBe(0o755);
			} finally {
				spy.mockRestore();
			}
		});

		test("rejects a directory replaced after open without chmodding the replacement", async ({
			expect,
		}) => {
			const root = await useTmp();
			const store = path.join(root, "secrets-store");
			const original = path.join(root, "original");
			await fs.mkdir(store);
			const open = fs.open;
			const spy = vi
				.spyOn(fs, "open")
				.mockImplementationOnce(async (file, flags) => {
					const handle = await open(file, flags);
					await fs.rename(store, original);
					await fs.mkdir(store);
					await fs.chmod(store, 0o755);
					return handle;
				});
			try {
				await expect(ensureSecretsStoreDirectory(store)).rejects.toMatchObject({
					cause: {
						message:
							"The Secrets Store directory could not be secured or was replaced.",
					},
				});
				expect((await fs.stat(original)).mode & 0o777).toBe(0o700);
				expect((await fs.stat(store)).mode & 0o777).toBe(0o755);
			} finally {
				spy.mockRestore();
			}
		});

		test.for(["failure", "ineffective"] as const)(
			"fails closed when chmod is %s",
			async (outcome, { expect }) => {
				const root = await useTmp();
				const store = path.join(root, "secrets-store");
				await fs.mkdir(store);
				await fs.chmod(store, 0o755);
				const handle = await fs.open(store, "r");
				const chmod = vi.spyOn(handle, "chmod");
				if (outcome === "failure") {
					chmod.mockRejectedValue(
						Object.assign(new Error("Cannot chmod"), { code: "EPERM" })
					);
				} else {
					chmod.mockResolvedValue(undefined);
				}
				const close = vi.spyOn(handle, "close");
				const open = vi.spyOn(fs, "open").mockResolvedValueOnce(handle);
				try {
					await expect(ensureSecretsStoreDirectory(store)).rejects.toThrow(
						"Unable to secure Secrets Store"
					);
					expect(chmod).toHaveBeenCalledWith(0o700);
					expect(close).toHaveBeenCalledOnce();
					expect((await fs.stat(store)).mode & 0o777).toBe(0o755);
				} finally {
					open.mockRestore();
					chmod.mockRestore();
					close.mockRestore();
					await handle.close();
				}
			}
		);
	}
);
