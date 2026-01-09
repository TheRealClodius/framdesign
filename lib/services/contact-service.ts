/**
 * Contact form API service
 */

import { parseApiError } from "../errors";
import type { ContactFormData } from "../schemas";

export interface ContactResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Send contact form submission
 */
export async function sendContactForm(data: ContactFormData): Promise<ContactResponse> {
  const response = await fetch("/api/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response.json();
}
