export const emailLinkPaths = {
  confirm: "/auth/confirm-email",
  recovery: "/auth/reset-password",
} as const;

export type EmailLinkKind = keyof typeof emailLinkPaths;

export function emailLinkRedirect(kind: EmailLinkKind, webOrigin?: string) {
  const path = emailLinkPaths[kind];
  return webOrigin ? new URL(path, webOrigin).href : "resume-tailoring://" + path.slice(1);
}

type LinkParams = Record<string, string | string[] | undefined>;

export function emailLinkCode(params: LinkParams, hash = "") {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.error || params.error_code || fragment.has("error") || fragment.has("error_code")) {
    return null;
  }
  const code = params.code;
  return typeof code === "string" && /^[\w.-]{8,256}$/.test(code) ? code : null;
}
