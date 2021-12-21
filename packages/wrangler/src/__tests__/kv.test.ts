import { setMock, unsetAllMocks } from "./mock-cfetch";
import { runWrangler } from "./run-wrangler";

describe("wrangler", () => {
  afterEach(() => {
    unsetAllMocks();
  });

  describe("kv:namespace", () => {
    it("can create a namespace", async () => {
      const KVNamespaces: { title: string; id: string }[] = [];
      setMock("/accounts/:accountId/storage/kv/namespaces", (uri, init) => {
        expect(init.method === "POST");
        expect(uri[0]).toEqual(
          "/accounts/some-account-id/storage/kv/namespaces"
        );
        const { title } = JSON.parse(init.body);
        expect(title).toEqual("worker-UnitTestNamespace");
        KVNamespaces.push({ title, id: "some-namespace-id" });
        return { id: "some-namespace-id" };
      });

      await runWrangler("kv:namespace create UnitTestNamespace");

      expect(KVNamespaces).toEqual([
        {
          title: "worker-UnitTestNamespace",
          id: "some-namespace-id",
        },
      ]);
    });

    it("can list namespaces", async () => {
      const KVNamespaces: { title: string; id: string }[] = [
        { title: "title-1", id: "id-1" },
        { title: "title-2", id: "id-2" },
      ];
      setMock(
        "/accounts/:accountId/storage/kv/namespaces\\?:qs",
        (uri, init) => {
          expect(uri[0]).toContain(
            "/accounts/some-account-id/storage/kv/namespaces"
          );
          expect(uri[2]).toContain("per_page=100");
          expect(uri[2]).toContain("order=title");
          expect(uri[2]).toContain("direction=asc");
          expect(uri[2]).toContain("page=1");
          expect(init).toBe(undefined);
          return KVNamespaces;
        }
      );
      const { stdout } = await runWrangler("kv:namespace list");
      const namespaces = JSON.parse(stdout) as { id: string; title: string }[];
      expect(namespaces).toEqual(KVNamespaces);
    });

    it("can delete a namespace", async () => {
      let accountId = "";
      let namespaceId = "";
      setMock(
        "/accounts/:accountId/storage/kv/namespaces/:namespaceId",
        (uri, init) => {
          accountId = uri[1];
          namespaceId = uri[2];
          expect(uri[0]).toEqual(
            "/accounts/some-account-id/storage/kv/namespaces/some-namespace-id"
          );
          expect(init.method).toBe("DELETE");
        }
      );
      await runWrangler(`kv:namespace delete --namespace-id some-namespace-id`);
      expect(accountId).toEqual("some-account-id");
      expect(namespaceId).toEqual("some-namespace-id");
    });
  });
});
