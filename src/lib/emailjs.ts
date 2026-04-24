import emailjs from "@emailjs/browser";

// Replace these with real values from emailjs.com:
//   1. Create a free account at https://emailjs.com
//   2. Add Gmail as a service and connect stormcirclecontact@gmail.com
//   3. Create two email templates — one for meteorologist applications, one for contact/feedback
//   4. Copy the Service ID, Public Key, and Template IDs into this file
export const EMAILJS_SERVICE_ID = "service_xxk4g8g";
export const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";

export const TEMPLATE_IDS = {
  meteorologistApplication: "YOUR_TEMPLATE_ID_1",
  contactFeedback: "YOUR_TEMPLATE_ID_2",
};

export function isEmailJsConfigured() {
  return (
    !EMAILJS_SERVICE_ID.startsWith("YOUR_") &&
    !EMAILJS_PUBLIC_KEY.startsWith("YOUR_") &&
    !TEMPLATE_IDS.meteorologistApplication.startsWith("YOUR_") &&
    !TEMPLATE_IDS.contactFeedback.startsWith("YOUR_")
  );
}

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
    { ...params, to_email: "stormcirclecontact@gmail.com" },
    EMAILJS_PUBLIC_KEY,
  );
}

