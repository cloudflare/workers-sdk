import {
  formatMessage,
  searchLocation,
  indexLocation,
  parseJSON,
  parseTOML,
} from "../parse";

describe("formatMessage", () => {
  test.each([
    {
      title: "should format message without location",
      message: {
        text: "Invalid argument",
      },
      output:
        "\x1B[31m✘ \x1B[41;31m[\x1B[41;97mERROR\x1B[41;31m]\x1B[0m \x1B[1mInvalid argument\x1B[0m\n\n",
    },
    {
      title: "should format message with location",
      message: {
        text: "Missing property: main",
        location: {
          file: "package.json",
          line: 1,
          column: 0,
          lineText: "{}",
        },
      },
      output:
        "\x1B[31m✘ \x1B[41;31m[\x1B[41;97mERROR\x1B[41;31m]\x1B[0m \x1B[1mMissing property: main\x1B[0m\n" +
        "\n    package.json:1:0:\n\x1B[37m      1 │ \x1B[32m\x1B[37m{}\n        ╵ \x1B[32m^\x1B[0m\n\n",
    },
    {
      title: "should format message with location and notes",
      message: {
        text: "Invalid property: type",
        location: {
          file: "package.toml",
          line: 3,
          column: 8,
          length: 7,
          lineText: "type = 'modular'",
          suggestion: "Did you mean 'module'?",
        },
        notes: [
          {
            text: "There are two acceptable types: 'module' and 'commonjs'",
          },
        ],
      },
      output:
        "\x1B[31m✘ \x1B[41;31m[\x1B[41;97mERROR\x1B[41;31m]\x1B[0m \x1B[1mInvalid property: type\x1B[0m\n" +
        "\n    package.toml:3:8:\n\x1B[37m      3 │ type = '\x1B[32mmodular\x1B[37m'\n        │         " +
        "\x1B[32m~~~~~~~\x1B[37m\n        ╵         \x1B[32mDid you mean 'module'?\x1B[0m\n\n  " +
        "There are two acceptable types: 'module' and 'commonjs'\n\n",
    },
  ])("$title", ({ message, output }) => {
    expect(formatMessage(message)).toBe(output);
  });
});

describe("parseTOML", () => {
  test.each([
    {
      title: "should parse toml that is empty",
      toml: "",
      json: {},
    },
    {
      title: "should parse toml with basic values",
      toml: "name = 'basic'\nversion = 1",
      json: {
        name: "basic",
        version: 1,
      },
    },
    {
      title: "should parse toml with complex values",
      toml: "name = 'complex'\n\tversion = 2\n[owner]\nname = ['tim']\nalive = true\n[owner.dog]\nexists = true",
      json: {
        name: "complex",
        version: 2,
        owner: {
          name: ["tim"],
          alive: true,
          dog: {
            exists: true,
          },
        },
      },
    },
  ])("$title", ({ toml, json }) => {
    expect(parseTOML(toml)).toStrictEqual(json);
  });
  test.each([
    {
      title: "should fail to parse toml with invalid string",
      toml: "\n\n\tname = 'fail",
      error: {
        text: "Unterminated string",
        location: {
          file: "config.toml",
          lineText: "\tname = 'fail",
          line: 3,
          column: 12,
        },
      },
    },
    {
      title: "should fail to parse toml with invalid header",
      toml: "[name",
      error: {
        text: "Key ended without value",
        location: {
          file: "config.toml",
          lineText: "[name",
          line: 1,
          column: 5,
        },
      },
    },
  ])("$title", async ({ toml, error }) => {
    await expect(async () =>
      parseTOML(toml, "config.toml")
    ).rejects.toMatchObject({
      detail: error,
    });
  });
});

describe("parseJSON", () => {
  test.each([
    {
      title: "should parse json that is empty",
      text: "{}",
      json: {},
    },
    {
      title: "should parse json with basic values",
      text: `{\n"name" : "basic",\n"version": 1\n}`,
      json: {
        name: "basic",
        version: 1,
      },
    },
    {
      title: "should parse json with complex values",
      text: `{\n\t"name":"complex",\n\t"spec":{\n\t\t"uptime":[1,2.5,3],\n\t\t"ok":true\n\t}\n}`,
      json: {
        name: "complex",
        spec: {
          uptime: [1, 2.5, 3],
          ok: true,
        },
      },
    },
  ])("$title", ({ text, json }) => {
    expect(parseJSON(text)).toStrictEqual(json);
  });
  test.each([
    {
      title: "should fail to parse json with invalid string",
      json: `\n{\n"version" "1\n}\n`,
      error: {
        text: "Unexpected string",
        location: {
          file: "config.json",
          lineText: `"version" "1`,
          line: 3,
          column: 9,
        },
      },
    },
    {
      title: "should fail to parse json with invalid number",
      json: `{\n\t"a":{\n\t\t"b":{\n\t\t\t"c":[012345]\n}\n}\n}`,
      error: {
        text: "Unexpected number",
        location: {
          file: "config.json",
          lineText: `\t\t\t"c":[012345]`,
          line: 4,
          column: 8,
        },
      },
    },
  ])("$title", async ({ json, error }) => {
    await expect(async () =>
      parseJSON(json, "config.json")
    ).rejects.toMatchObject({
      detail: error,
    });
  });
});

describe("indexLocation", () => {
  test.each([
    {
      title: "should calculate location from one-line input",
      input: "",
      index: 1,
      location: {
        line: 1,
        column: 0,
        lineText: "",
      },
    },
    {
      title: "should calculate location from multi-line input",
      input: `\n{\n\t"hello":"world"\n}\n`,
      index: 11,
      location: {
        line: 3,
        column: 7,
        lineText: `\t"hello":"world"`,
      },
    },
    {
      title: "should calculate location when index is out of bounds",
      input: "\n\n\n\n",
      index: 10,
      location: {
        line: 5,
        column: 0,
        lineText: undefined,
      },
    },
  ])("$title", ({ input, index, location }) => {
    expect(indexLocation(input, index)).toStrictEqual(location);
  });
});

describe("searchLocation", () => {
  test.each([
    {
      title: "should calculate location from one-line match",
      input: "name = 'coolthing'",
      search: "coolthing",
      location: {
        line: 1,
        column: 8,
        length: 9,
        lineText: "name = 'coolthing'",
      },
    },
    {
      title: "should calculate location from multi-line match",
      input: `\n{"versions":[\n\t"1.2.3",\n\t"1.2.4",\n\t"1.2.5"\n]}\n`,
      search: "1.2.4",
      location: {
        line: 4,
        column: 2,
        length: 5,
        lineText: `\t"1.2.4",`,
      },
    },
    {
      title: "should calculate location from no match",
      input: "\n{}\n",
      search: "apple",
      location: {
        line: 3,
        column: 0,
        length: undefined,
        lineText: undefined,
      },
    },
  ])("$title", ({ input, search, location }) => {
    expect(searchLocation(input, search)).toStrictEqual(location);
  });
});
