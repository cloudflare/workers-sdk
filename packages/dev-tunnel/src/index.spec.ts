import { extractComponents } from "./index";

describe("url extraction", () => {
  type SuccessfulExtractionTestCase = {
    url: string;
    outcome: {
      hostId: string;
      path: string;
    };
  };

  type FailedExtractionTestCase = {
    url: string;
    outcome: "fail";
  };

  type ExtractionTestCase =
    | SuccessfulExtractionTestCase
    | FailedExtractionTestCase;

  const shouldSucceed = (
    testCase: ExtractionTestCase
  ): testCase is SuccessfulExtractionTestCase => {
    return testCase.outcome !== "fail";
  };

  const testCases: ExtractionTestCase[] = [
    {
      url: "https://tunnel-url.com/some-host-id",
      outcome: {
        hostId: "some-host-id",
        path: "",
      },
    },
    {
      url: "https://tunnel-url.com/some-host-id/",
      outcome: {
        hostId: "some-host-id",
        path: "/",
      },
    },
    { url: "https://tunnel-url.com", outcome: "fail" },
    { url: "f", outcome: "fail" },
    { url: "", outcome: "fail" },
    { url: "not-a-url", outcome: "fail" },
    { url: "http://", outcome: "fail" },
    { url: "//h//", outcome: "fail" },
    {
      url: "http://a.com/some-host-id/some/nested/path?with=parameters#anchor",
      outcome: {
        hostId: "some-host-id",
        path: "/some/nested/path?with=parameters#anchor",
      },
    },
  ];

  for (const testCase of testCases) {
    if (shouldSucceed(testCase)) {
      const {
        url,
        outcome: { hostId, path },
      } = testCase;

      it(`extracts { hostId: "${hostId}", path: "${path}" } from ${url}`, () => {
        expect(extractComponents(url)).toStrictEqual({ hostId, path });
      });
    } else {
      it(`throws on url "${testCase.url}"`, () => {
        expect(() => {
          extractComponents(testCase.url);
        }).toThrow();
      });
    }
  }
});
