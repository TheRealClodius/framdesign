import { NextResponse } from "next/server";

export async function GET() {
  // Check environment variables (without exposing the actual values)
  const envCheck = {
    GEMINI_API_KEY: {
      present: !!process.env.GEMINI_API_KEY,
      length: process.env.GEMINI_API_KEY?.length || 0,
      startsWith: process.env.GEMINI_API_KEY?.substring(0, 4) || "N/A",
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
    QDRANT_CLUSTER_ENDPOINT: {
      present: !!process.env.QDRANT_CLUSTER_ENDPOINT,
      length: process.env.QDRANT_CLUSTER_ENDPOINT?.length || 0,
    },
    QDRANT_API_KEY: {
      present: !!process.env.QDRANT_API_KEY,
      length: process.env.QDRANT_API_KEY?.length || 0,
    },
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV || "Not set",
  };

  // Test if we can import the chat route dependencies
  let toolRegistryStatus = "not tested";
  try {
    const { toolRegistry } = await import("@/tools/_core/registry");
    toolRegistryStatus = toolRegistry ? "imported" : "null";
  } catch (e) {
    toolRegistryStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({ ...envCheck, toolRegistryStatus }, { status: 200 });
}
