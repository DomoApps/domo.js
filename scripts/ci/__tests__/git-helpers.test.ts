import {
  getHeadCommitTime,
  listRemoteReleaseBranches,
  daysSince,
} from "../git-helpers";

const mockExec = jest.fn();
jest.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => mockExec(...args),
}));

describe("getHeadCommitTime", () => {
  beforeEach(() => mockExec.mockReset());

  it("returns the commit time as a Date", () => {
    mockExec.mockReturnValueOnce(Buffer.from("2026-04-20T12:00:00+00:00\n"));
    const result = getHeadCommitTime("master");
    expect(result.toISOString()).toBe("2026-04-20T12:00:00.000Z");
    expect(mockExec).toHaveBeenCalledWith("git", [
      "log",
      "-1",
      "--format=%cI",
      "master",
    ]);
  });
});

describe("listRemoteReleaseBranches", () => {
  beforeEach(() => mockExec.mockReset());

  it("returns short names of release/v* remote branches", () => {
    mockExec.mockReturnValueOnce(
      Buffer.from(
        "origin/release/v6.0.1\norigin/release/v6.0.2\norigin/release/v6.0.3\n",
      ),
    );
    expect(listRemoteReleaseBranches()).toEqual([
      "release/v6.0.1",
      "release/v6.0.2",
      "release/v6.0.3",
    ]);
  });

  it("returns empty list when none match", () => {
    mockExec.mockReturnValueOnce(Buffer.from(""));
    expect(listRemoteReleaseBranches()).toEqual([]);
  });
});

describe("daysSince", () => {
  it("returns the number of whole days since the given timestamp", () => {
    const fixedNow = new Date("2026-04-24T14:00:00Z");
    const past = new Date("2026-04-20T14:00:00Z");
    expect(daysSince(past, fixedNow)).toBe(4);
  });

  it("returns fractional days truncated toward zero", () => {
    const fixedNow = new Date("2026-04-24T18:00:00Z");
    const past = new Date("2026-04-24T06:00:00Z");
    expect(daysSince(past, fixedNow)).toBe(0);
  });
});
