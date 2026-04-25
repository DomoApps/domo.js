import { getLatestStableVersion } from "../npm-helpers";

const mockExec = jest.fn();
jest.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => mockExec(...args),
}));

describe("getLatestStableVersion", () => {
  beforeEach(() => mockExec.mockReset());

  it("returns the latest dist-tag value", () => {
    mockExec.mockReturnValueOnce(Buffer.from("6.0.2\n"));
    expect(getLatestStableVersion("ryuu.js")).toBe("6.0.2");
    expect(mockExec).toHaveBeenCalledWith("npm", [
      "view",
      "ryuu.js",
      "dist-tags.latest",
    ]);
  });

  it("returns null when there is no latest tag", () => {
    mockExec.mockReturnValueOnce(Buffer.from(""));
    expect(getLatestStableVersion("ryuu.js")).toBeNull();
  });

  it("returns null when npm view exits with E404 in stderr", () => {
    const err: any = new Error("npm error");
    err.stderr = Buffer.from("npm ERR! code E404");
    mockExec.mockImplementationOnce(() => {
      throw err;
    });
    expect(getLatestStableVersion("ryuu.js")).toBeNull();
  });

  it("rethrows other errors", () => {
    const err: any = new Error("network");
    err.stderr = Buffer.from("");
    mockExec.mockImplementationOnce(() => {
      throw err;
    });
    expect(() => getLatestStableVersion("ryuu.js")).toThrow(/network/);
  });
});
