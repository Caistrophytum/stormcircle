import emailjs from "@emailjs/browser";

// Replace these with real values from emailjs.com:
//   1. Create a free account at https://emailjs.com
//   2. Add Gmail as a service and connect stormcirclecontact@gmail.com
//   3. Create two email templates — one for meteorologist applications, one for contact/feedback
//   4. Copy the Service ID, Public Key, and Template IDs into this file
export const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";
export const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";

export const TEMPLATE_IDS = {
  meteorologistApplication: "YOUR_TEMPLATE_ID_1",
  contactFeedback: "YOUR_TEMPLATE_ID_2",
};

export function sendEmail(templateId: string, params: Record<string, string>) {
  return emailjs.send(
    EMAILJS_SERVICE_ID,
    templateId,
    { ...params, to_email: "stormcirclecontact@gmail.com" },
    EMAILJS_PUBLIC_KEY,
  );
}
