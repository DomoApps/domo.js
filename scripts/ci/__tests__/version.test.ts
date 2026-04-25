import {
  parseVersion,
  incrementPrereleaseCounter,
  setPrerelease,
  stripPrerelease,
} from "../version";

describe("parseVersion", () => {
  it("parses a stable version", () => {
    expect(parseVersion("6.0.3")).toEqual({
      base: "6.0.3",
      major: 6,
      minor: 0,
      patch: 3,
      prereleaseTag: null,
      prereleaseCounter: null,
    });
  });

  it("parses an alpha prerelease", () => {
    expect(parseVersion("6.0.3-alpha.7")).toEqual({
      base: "6.0.3",
      major: 6,
      minor: 0,
      patch: 3,
      prereleaseTag: "alpha",
      prereleaseCounter: 7,
    });
  });

  it("parses a beta prerelease", () => {
    expect(parseVersion("6.0.3-beta.0")).toEqual({
      base: "6.0.3",
      major: 6,
      minor: 0,
      patch: 3,
      prereleaseTag: "beta",
      prereleaseCounter: 0,
    });
  });

  it("throws on malformed version", () => {
    expect(() => parseVersion("not-a-version")).toThrow(/invalid version/i);
  });
});

describe("incrementPrereleaseCounter", () => {
  it("bumps the alpha counter", () => {
    expect(incrementPrereleaseCounter("6.0.3-alpha.5")).toBe("6.0.3-alpha.6");
  });

  it("bumps the beta counter", () => {
    expect(incrementPrereleaseCounter("6.0.3-beta.0")).toBe("6.0.3-beta.1");
  });

  it("throws if the version is not a prerelease", () => {
    expect(() => incrementPrereleaseCounter("6.0.3")).toThrow(
      /not a prerelease/i,
    );
  });
});

describe("setPrerelease", () => {
  it("converts stable to alpha.0", () => {
    expect(setPrerelease("6.0.3", "alpha")).toBe("6.0.3-alpha.0");
  });

  it("converts alpha to beta.0", () => {
    expect(setPrerelease("6.0.3-alpha.7", "beta")).toBe("6.0.3-beta.0");
  });
});

describe("stripPrerelease", () => {
  it("strips alpha suffix", () => {
    expect(stripPrerelease("6.0.3-alpha.7")).toBe("6.0.3");
  });

  it("strips beta suffix", () => {
    expect(stripPrerelease("6.0.3-beta.4")).toBe("6.0.3");
  });

  it("returns base unchanged when no suffix", () => {
    expect(stripPrerelease("6.0.3")).toBe("6.0.3");
  });
});
