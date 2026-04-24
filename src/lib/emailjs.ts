import emailjs from "@emailjs/browser";

// EmailJS configuration. Public Key is safe to ship in client code.
//   1. Create a free account at https://emailjs.com
//   2. Add Gmail as a service and connect stormcirclecontact@gmail.com
//   3. Create two email templates — one for meteorologist applications, one for contact/feedback
//   4. **IMPORTANT:** In each template's settings, hardcode the "To Email"
//      field to stormcirclecontact@gmail.com. Do NOT use {{to_email}} as a
//      template variable — otherwise anyone with the public key could send
//      mail to arbitrary addresses through your account.
export const EMAILJS_SERVICE_ID = "service_xxk4g8g";
export const EMAILJS_PUBLIC_KEY = "s0M3hsjSA8UikMSrN";

export const TEMPLATE_IDS = {
  meteorologistApplication: "template_idpisy9",
  contactFeedback: "template_kcxfn6q",
};

export function isEmailJsConfigured() {
  return (
    !EMAILJS_SERVICE_ID.startsWith("YOUR_") &&
    !EMAILJS_PUBLIC_KEY.startsWith("YOUR_") &&
    !TEMPLATE_IDS.meteorologistApplication.startsWith("YOUR_") &&
    !TEMPLATE_IDS.contactFeedback.startsWith("YOUR_")
  );
}

/**
 * Strips HTML tags and collapses dangerous control characters from a string.
 * Used to scrub every parameter we hand to EmailJS so nobody can inject
 * markup or scripts into the inbox.
 */
function stripHtml(input: string): string {
  return input
    // Remove anything that looks like an HTML/script tag
    .replace(/<\/?[^>]+(>|$)/g, "")
    // Decode-then-strip stray angle brackets that survived
    .replace(/[<>]/g, "")
    // Collapse non-printable control chars (keep \n, \r, \t)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function sanitizeParams(params: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    safe[k] = typeof v === "string" ? stripHtml(v) : String(v ?? "");
  }
  return safe;
}

export function sendEmail(templateId: string, params: Record<string, string>) {
  if (templateId.startsWith("YOUR_") || EMAILJS_SERVICE_ID.startsWith("YOUR_")) {
    return Promise.reject(
      new Error(
        "EmailJS is not configured yet. Add your Service ID, Public Key, and Template IDs in src/lib/emailjs.ts.",
      ),
    );
  }
  // NOTE: We deliberately do NOT pass `to_email` here. The recipient must be
  // hardcoded in the EmailJS template's "To Email" field on the dashboard,
  // otherwise the public key could be abused to send mail anywhere.
  return emailjs.send(
    EMAILJS_SERVICE_ID,
    templateId,
    sanitizeParams(params),
    EMAILJS_PUBLIC_KEY,
  );
}
