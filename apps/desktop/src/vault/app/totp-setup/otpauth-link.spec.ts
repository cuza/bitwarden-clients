import { parseOtpAuthLink } from "./otpauth-link";

describe("parseOtpAuthLink", () => {
  it("reads the issuer and account from the label", () => {
    expect(
      parseOtpAuthLink("otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP"),
    ).toEqual({ issuer: "Example", account: "alice@example.com" });
  });

  it("prefers the issuer parameter over the label", () => {
    expect(
      parseOtpAuthLink("otpauth://totp/Old%20Name:alice?secret=ABC&issuer=New%20Name"),
    ).toEqual({ issuer: "New Name", account: "alice" });
  });

  it("accepts a label with only an account", () => {
    expect(parseOtpAuthLink("otpauth://totp/alice?secret=ABC")).toEqual({
      issuer: undefined,
      account: "alice",
    });
  });

  it.each([
    ["a counter-based link", "otpauth://hotp/Example:alice?secret=ABC&counter=0"],
    ["a link without a secret", "otpauth://totp/Example:alice"],
    ["another scheme", "https://example.com/?secret=ABC"],
    ["a malformed label", "otpauth://totp/%E0%A4%A?secret=ABC"],
    ["not a URL", "not a url"],
    ["an oversized link", `otpauth://totp/A:b?secret=ABC&issuer=${"x".repeat(5000)}`],
  ])("rejects %s", (_, uri) => {
    expect(parseOtpAuthLink(uri)).toBeUndefined();
  });
});
