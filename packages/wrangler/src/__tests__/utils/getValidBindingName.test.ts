import { getValidBindingName } from "../../utils/getValidBindingName";

describe("getValidBindingName", () => {
  it("should replace dashes with underscores", () => {
    expect(getValidBindingName("MY-NAME")).toBe("MY_NAME");
  });

  it("should replace whitespaces with underscores", () => {
    expect(getValidBindingName("MY NAME")).toBe("MY_NAME");
    expect(getValidBindingName("MY	NAME")).toBe("MY_NAME");
    expect(getValidBindingName("MY\nNAME")).toBe("MY_NAME");
  });

  it("should remove all invalid character", () => {
    expect(getValidBindingName("NAME$")).toBe("NAME");
  });

  it("should not remove alphabetic characters, numbers, or underscores", () => {
    expect(getValidBindingName("my_NAME")).toBe("my_NAME");
  });
});