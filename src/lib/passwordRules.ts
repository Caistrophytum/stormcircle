/** Shared password rules for sign-up and password reset. */
export const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: "len", label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { id: "upper", label: "At least 1 uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { id: "num", label: "At least 1 number", test: (pw) => /[0-9]/.test(pw) },
];

/** First unmet rule as a sentence, or null when the password passes. */
export function passwordProblem(pw: string): string | null {
  if (pw.length > 72) return "Password is too long: use 72 characters or fewer.";
  const miss = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label.toLowerCase());
  return miss.length ? `Password isn't secure enough: it needs ${miss.join(", ")}.` : null;
}

/** Turn a server password rejection into a plain explanation. */
export function friendlyPasswordError(err: { message?: string; code?: string; reasons?: string[] } | null | undefined): string | null {
  if (!err) return null;
  const msg = err.message ?? "";
  const reasons = (err as { reasons?: string[] }).reasons ?? [];
  if (reasons.includes("pwned") || /pwned|leak|compromised|breach/i.test(msg))
    return "This password has appeared in a known data leak, so attackers could guess it. Please choose a different one.";
  if (err.code === "weak_password" || /weak|password should/i.test(msg))
    return "Password isn't secure enough: make it longer and mix uppercase letters, lowercase letters and numbers.";
  if (err.code === "same_password" || /different from the old/i.test(msg))
    return "Your new password must be different from your current one.";
  return null;
}
