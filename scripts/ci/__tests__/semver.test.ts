import { compareSemverBases } from "../semver";

describe("compareSemverBases", () => {
  it("returns patch when only patch differs", () => {
    expect(compareSemverBases("6.0.3", "6.0.2")).toBe("patch");
  });

  it("returns minor when minor differs (patch ignored)", () => {
    expect(compareSemverBases("6.1.0", "6.0.2")).toBe("minor");
  });

  it("returns major when major differs", () => {
    expect(compareSemverBases("7.0.0", "6.0.2")).toBe("major");
  });

  it("returns major when there is no last stable", () => {
    expect(compareSemverBases("6.0.3", null)).toBe("major");
  });

  it("treats equal versions as patch", () => {
    expect(compareSemverBases("6.0.3", "6.0.3")).toBe("patch");
  });

  it("throws if either argument is malformed", () => {
    expect(() => compareSemverBases("not-a-version", "6.0.2")).toThrow(/invalid version/i);
  });
});
