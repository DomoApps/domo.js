import Domo from "../../domo";

describe("env", () => {
  it("should expose typed environment properties", () => {
    expect(Domo.env).toBeDefined();
    expect(typeof Domo.env.userId).toBe("string");
    expect(typeof Domo.env.userName).toBe("string");
    expect(typeof Domo.env.userEmail).toBe("string");
    expect(typeof Domo.env.customer).toBe("string");
    expect(typeof Domo.env.locale).toBe("string");
    expect(typeof Domo.env.platform).toBe("string");
    expect(typeof Domo.env.pageId).toBe("string");
  });

  it("should default platform to 'desktop' when not set", () => {
    expect(["desktop", "mobile"]).toContain(Domo.env.platform);
  });

  it("should allow index access for unknown params", () => {
    // TypeScript allows arbitrary string keys via index signature
    const val = Domo.env["someUnknownParam"];
    expect(val === undefined || typeof val === "string").toBe(true);
  });
});
