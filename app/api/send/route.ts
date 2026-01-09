import { NextResponse } from "next/server";
import { Resend } from "resend";
import { contactFormSchema } from "@/lib/schemas";
import { handleServerError } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);
    const body = await request.json();
    const { name, companyName, email, message } = contactFormSchema.parse(body);

    const emailText = `Name: ${name}\n${companyName ? `Company: ${companyName}\n` : ''}Email: ${email}\n\nMessage:\n${message}`;

    const data = await resend.emails.send({
      from: "Contact Form <onboarding@resend.dev>",
      to: [process.env.CONTACT_EMAIL || "delivered@resend.dev"],
      subject: `New message from ${name}${companyName ? ` (${companyName})` : ''}`,
      replyTo: email,
      text: emailText,
    });

    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error sending email:", error);
    return handleServerError(error);
  }
}

