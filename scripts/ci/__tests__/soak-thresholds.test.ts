import { soakThresholdDays } from "../soak-thresholds";

describe("soakThresholdDays", () => {
  it("alpha + patch = 3", () => {
    expect(soakThresholdDays("alpha", "patch")).toBe(3);
  });

  it("alpha + minor = 7", () => {
    expect(soakThresholdDays("alpha", "minor")).toBe(7);
  });

  it("alpha + major = 14", () => {
    expect(soakThresholdDays("alpha", "major")).toBe(14);
  });

  it("beta + patch = 7", () => {
    expect(soakThresholdDays("beta", "patch")).toBe(7);
  });

  it("beta + minor = 14", () => {
    expect(soakThresholdDays("beta", "minor")).toBe(14);
  });

  it("beta + major = 30", () => {
    expect(soakThresholdDays("beta", "major")).toBe(30);
  });
});
