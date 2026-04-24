/**
 * emailjs.ts — thin wrapper around @emailjs/browser used for two flows:
 *   1. Meteorologist badge applications (template_idpisy9)
 *   2. Contact / feedback messages       (template_kcxfn6q)
 *
 * Security notes:
 *   • The Public Key is intentionally checked in. EmailJS public keys are
 *     designed to be exposed client-side — they only allow sending through
 *     the templates you've configured on the EmailJS dashboard.
 *   • The recipient address is hardcoded inside each template's "To Email"
 *     field on the EmailJS dashboard. We do NOT pass `to_email` as a
 *     parameter — otherwise an attacker could read the public key and use
 *     it to send mail to arbitrary addresses through your account.
 *   • Every parameter is HTML-stripped before being handed to EmailJS, so
 *     a user can't smuggle <script> or other markup into the inbox.
 *
 * Setup checklist (already done, kept here for reference):
 *   1. Create a free EmailJS account
 *   2. Add Gmail as a service and connect stormcirclecontact@gmail.com
 *   3. Create the two templates listed above
 *   4. In each template's settings, hardcode the "To Email" field to
 *      stormcirclecontact@gmail.com — do NOT use {{to_email}} as a variable
 *   5. Copy the Service ID, Public Key, and Template IDs into this file
 */
import emailjs from "@emailjs/browser";

export const EMAILJS_SERVICE_ID = "service_xxk4g8g";
export const EMAILJS_PUBLIC_KEY = "s0M3hsjSA8UikMSrN";

export const TEMPLATE_IDS = {
  meteorologistApplication: "template_idpisy9",
  contactFeedback: "template_kcxfn6q",
};

/**
 * Returns true once all four IDs above have been filled in (i.e. they
 * don't start with the placeholder prefix). Components use this to gate
 * "send" actions so we never call EmailJS with bogus credentials.
 */
export function isEmailJsConfigured() {
  return (
    !EMAILJS_SERVICE_ID.startsWith("YOUR_") &&
    !EMAILJS_PUBLIC_KEY.startsWith("YOUR_") &&
    !TEMPLATE_IDS.meteorologistApplication.startsWith("YOUR_") &&
    !TEMPLATE_IDS.contactFeedback.startsWith("YOUR_")
  );
}

/**
 * Removes HTML tags and dangerous control characters from a string.
 * Used on every parameter we hand to EmailJS so nobody can inject
 * markup or scripts into the inbox.
 */
function stripHtml(input: string): string {
  return input
    // Strip anything that looks like an HTML/script tag, e.g. <b>, </script>
    .replace(/<\/?[^>]+(>|$)/g, "")
    // Decode-then-strip stray angle brackets that survived
    .replace(/[<>]/g, "")
    // Collapse non-printable control chars (keep \n, \r, \t)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

/** Apply stripHtml to every value in an object. */
function sanitizeParams(params: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    safe[k] = typeof v === "string" ? stripHtml(v) : String(v ?? "");
  }
  return safe;
}

/**
 * Sends an email through EmailJS using the given template ID and
 * substitution params. The template's "To Email" field on the EmailJS
 * dashboard determines the recipient — we never pass it from the client.
 */
export function sendEmail(templateId: string, params: Record<string, string>) {
  if (templateId.startsWith("YOUR_") || EMAILJS_SERVICE_ID.startsWith("YOUR_")) {
    return Promise.reject(
      new Error(
        "EmailJS is not configured yet. Add your Service ID, Public Key, and Template IDs in src/lib/emailjs.ts.",
      ),
    );
  }
  return emailjs.send(
    EMAILJS_SERVICE_ID,
    templateId,
    sanitizeParams(params),
    EMAILJS_PUBLIC_KEY,
  );
}
