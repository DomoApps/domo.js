import { evaluateSoakDecisions, type SoakInputs } from "../soak-check";

const fixedNow = new Date("2026-04-24T14:00:00Z");
const tenDaysAgo = new Date("2026-04-14T14:00:00Z");
const oneDayAgo = new Date("2026-04-23T14:00:00Z");

function mkInputs(overrides: Partial<SoakInputs> = {}): SoakInputs {
  return {
    now: fixedNow,
    masterVersion: "6.0.3-alpha.7",
    masterCommitTime: tenDaysAgo,
    releaseBranches: [],
    lastStableVersion: "6.0.2",
    openBlockersForLabel: async () => 0,
    ...overrides,
  };
}

describe("evaluateSoakDecisions", () => {
  it("triggers cut-beta when alpha gate passes and no other beta in flight", async () => {
    const decisions = await evaluateSoakDecisions(mkInputs());
    expect(decisions).toEqual([{ kind: "cut-beta", from: "master" }]);
  });

  it("does not trigger when alpha is too young", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({ masterCommitTime: oneDayAgo }),
    );
    expect(decisions).toEqual([]);
  });

  it("does not trigger when an open Critical/Major bug exists", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({ openBlockersForLabel: async () => 1 }),
    );
    expect(decisions).toEqual([]);
  });

  it("triggers publish-stable for a soaked beta branch", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({
        releaseBranches: [
          {
            branch: "release/v6.0.3",
            version: "6.0.3-beta.4",
            commitTime: tenDaysAgo,
          },
        ],
      }),
    );
    expect(decisions).toContainEqual({
      kind: "publish-stable",
      branch: "release/v6.0.3",
    });
  });

  it("blocks cut-beta when another release branch is still in beta", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({
        releaseBranches: [
          {
            branch: "release/v6.0.2",
            version: "6.0.2-beta.1",
            commitTime: oneDayAgo,
          },
        ],
      }),
    );
    expect(decisions).not.toContainEqual({ kind: "cut-beta", from: "master" });
  });

  it("uses major-bump threshold when no last stable exists", async () => {
    const decisions = await evaluateSoakDecisions(
      mkInputs({ lastStableVersion: null, masterCommitTime: tenDaysAgo }),
    );
    expect(decisions).toEqual([]);
  });
});
