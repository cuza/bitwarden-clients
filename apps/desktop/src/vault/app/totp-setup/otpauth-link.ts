/** Who an `otpauth://totp/...` setup link is for, as far as the link says. */
export type OtpAuthLink = {
  issuer?: string;
  account?: string;
};

const MAX_LINK_LENGTH = 2048;

/**
 * Reads a one-time code setup link, e.g.
 * `otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example`.
 *
 * @returns `undefined` unless the link is a TOTP link with a secret, the only kind
 * Bitwarden generates codes for.
 */
export function parseOtpAuthLink(uri: string): OtpAuthLink | undefined {
  // Real setup links are short; anything bigger is junk a website could send to freeze the app.
  if (uri.length > MAX_LINK_LENGTH) {
    return undefined;
  }
  let url: URL;
  let label: string;
  try {
    url = new URL(uri);
    label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return undefined;
  }
  if (
    url.protocol !== "otpauth:" ||
    url.host.toLowerCase() !== "totp" ||
    !url.searchParams.get("secret")
  ) {
    return undefined;
  }

  // The label is "Issuer:account" or just "account".
  const separator = label.indexOf(":");
  const labelIssuer = separator >= 0 ? label.slice(0, separator).trim() : "";
  const account = (separator >= 0 ? label.slice(separator + 1) : label).trim();
  const issuer = url.searchParams.get("issuer")?.trim() || labelIssuer;

  return { issuer: issuer || undefined, account: account || undefined };
}
