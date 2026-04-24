import emailjs from "@emailjs/browser";

// Public EmailJS configuration — these are publishable keys, safe in the browser.
// Configure them in Lovable env (Step 4):
//   VITE_EMAILJS_SERVICE_ID
//   VITE_EMAILJS_PUBLIC_KEY
//   VITE_EMAILJS_TEMPLATE_METEOROLOGIST  (template for badge applications)
//   VITE_EMAILJS_TEMPLATE_CONTACT        (template for contact / feedback)
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;
const TEMPLATE_METEOROLOGIST = import.meta.env.VITE_EMAILJS_TEMPLATE_METEOROLOGIST as string | undefined;
const TEMPLATE_CONTACT = import.meta.env.VITE_EMAILJS_TEMPLATE_CONTACT as string | undefined;

export function isEmailJsConfigured() {
  return Boolean(SERVICE_ID && PUBLIC_KEY);
}

async function send(templateId: string | undefined, params: Record<string, string>) {
  if (!SERVICE_ID || !PUBLIC_KEY || !templateId) {
    throw new Error("EmailJS is not configured. Set VITE_EMAILJS_* env vars.");
  }
  return emailjs.send(SERVICE_ID, templateId, params, { publicKey: PUBLIC_KEY });
}

export async function sendMeteorologistApplication(p: {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  description: string;
}) {
  return send(TEMPLATE_METEOROLOGIST, {
    subject: `Meteorologist Badge Application — ${p.username}`,
    from_email: p.email,
    reply_to: p.email,
    name: `${p.firstName} ${p.lastName}`,
    first_name: p.firstName,
    last_name: p.lastName,
    username: p.username,
    description: p.description,
  });
}

export async function sendContactMessage(p: {
  username: string;
  email: string;
  subject: string;
  message: string;
}) {
  return send(TEMPLATE_CONTACT, {
    subject: `${p.subject} from ${p.username}`,
    from_email: p.email,
    reply_to: p.email,
    username: p.username,
    message: p.message,
    category: p.subject,
  });
}
