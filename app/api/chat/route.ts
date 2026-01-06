import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { FRAM_SYSTEM_PROMPT } from "@/lib/config";

// Helper function to retry API calls with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
      
      // Check if it's a retryable error (overloaded, rate limit, etc.)
      const isRetryable = 
        errorMessage.includes("overloaded") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("quota") ||
        errorMessage.includes("503") ||
        errorMessage.includes("429");
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body;

    const apiKey = process.env.GEMINI_API_KEY;

    // Log for debugging (API key presence, not the key itself)
    console.log("GEMINI_API_KEY present:", !!apiKey);
    console.log("GEMINI_API_KEY length:", apiKey ? apiKey.length : 0);

    if (!apiKey) {
      // Return a mock response if no API key is configured
      console.error("GEMINI_API_KEY is missing!");
      return NextResponse.json({
        message: "I AM A DEMO AI ASSISTANT. PLEASE CONFIGURE THE GEMINI_API_KEY ENVIRONMENT VARIABLE TO ENABLE REAL RESPONSES."
      });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build conversation history with system prompt
    const history: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    // Add system instruction as initial context
    history.push({
      role: "user",
      parts: [{ text: FRAM_SYSTEM_PROMPT }],
    });
    history.push({
      role: "model",
      parts: [{ text: "UNDERSTOOD." }],
    });

    // Convert previous messages to Gemini format
    for (const msg of messages) {
      if (msg.content && msg.content.trim()) {
        history.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Generate response with full conversation history (with retry logic)
    const response = await retryWithBackoff(async () => {
      console.log("Calling Gemini API with model: gemini-2.5-flash");
      console.log("History length:", history.length);
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash", // Gemini 2.5 Flash: $0.15/1M input tokens, $0.60/1M output tokens
        contents: history,
      });
      console.log("Gemini API response received");
      console.log("Response structure:", JSON.stringify(Object.keys(result || {})));
      return result;
    });

    // Try to access text property - check different possible structures
    let text: string;
    if (response.text) {
      text = response.text;
    } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
      text = response.candidates[0].content.parts[0].text;
    } else {
      console.error("Unexpected response structure:", JSON.stringify(response, null, 2));
      throw new Error("Unable to extract text from API response");
    }
    
    console.log("Response text length:", text.length);

    return NextResponse.json({
      message: text
    });

  } catch (error) {
    console.error("Error in chat route:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error("Error details:", {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : undefined,
    });
    
    // Check if it's an overloaded error
    if (errorMessage.toLowerCase().includes("overloaded")) {
      return NextResponse.json(
        { error: "The AI model is currently overloaded. Please try again in a moment." },
        { status: 503 }
      );
    }
    
    // Check for API key errors
    if (errorMessage.toLowerCase().includes("api key") || errorMessage.toLowerCase().includes("authentication") || errorMessage.toLowerCase().includes("401") || errorMessage.toLowerCase().includes("403")) {
      return NextResponse.json(
        { error: "Invalid API key. Please check your GEMINI_API_KEY environment variable.", details: errorMessage },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal Server Error", details: errorMessage },
      { status: 500 }
    );
  }
}
