import { NextResponse } from "next/server";

export async function GET() {
  // Check environment variables (without exposing the actual values)
  const envCheck = {
    GEMINI_API_KEY: {
      present: !!process.env.GEMINI_API_KEY,
      length: process.env.GEMINI_API_KEY?.length || 0,
      startsWith: process.env.GEMINI_API_KEY?.substring(0, 4) || "N/A",
    },
    GOOGLE_GENAI_API_KEY: {
      present: !!process.env.GOOGLE_GENAI_API_KEY,
      length: process.env.GOOGLE_GENAI_API_KEY?.length || 0,
      startsWith: process.env.GOOGLE_GENAI_API_KEY?.substring(0, 4) || "N/A",
    },
    RESEND_API_KEY: {
      present: !!process.env.RESEND_API_KEY,
      length: process.env.RESEND_API_KEY?.length || 0,
      startsWith: process.env.RESEND_API_KEY?.substring(0, 4) || "N/A",
    },
    CONTACT_EMAIL: {
      present: !!process.env.CONTACT_EMAIL,
      value: process.env.CONTACT_EMAIL || "Not set",
    },
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV || "Not set",
  };

  return NextResponse.json(envCheck, { status: 200 });
}
