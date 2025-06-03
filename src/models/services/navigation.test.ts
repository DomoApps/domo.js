import { navigate } from "./navigation";

describe("navigate", () => {
  beforeEach(() => {
    window.parent.postMessage = jest.fn();
  });

  it("should call navigate", () => {
    navigate("/test", true);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: "navigate", url: "/test", isNewWindow: true }),
      "*"
    );
  });
});
