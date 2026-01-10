/**
 * Chat API service
 */

import { parseApiError, OverloadedError } from "../errors";
import { prepareMessagesForSend } from "../message-utils";
import type { Message } from "../storage";

export interface ChatRequest {
  messages: Message[];
  timeoutExpired?: boolean;
}

export interface ChatResponse {
  message?: string;
  error?: string;
  timeout?: {
    duration: number;
    until: number;
  };
  startVoiceSession?: boolean;
  pendingRequest?: string | null; // Pending user request to address when voice starts
}

/**
 * Stream chat response from API
 * Returns ChatResponse when response is JSON (tool calls), void when streaming
 */
export async function streamChatResponse(
  request: ChatRequest,
  onChunk: (chunk: string) => void,
  onError?: (error: Error) => void
): Promise<ChatResponse | void> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: prepareMessagesForSend(request.messages),
        timeoutExpired: request.timeoutExpired || false,
      }),
    });

    if (!response.ok) {
      const error = await parseApiError(response);
      onError?.(error);
      throw error;
    }

    const contentType = response.headers.get("Content-Type");

    if (contentType?.includes("text/plain")) {
      // Streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          onChunk(chunk);
        }
      }
      return; // Streaming complete, return void
    } else {
      // JSON response (timeout, tool call, or error)
      const data: ChatResponse = await response.json();
      if (data.message) {
        onChunk(data.message);
      } else if (data.error) {
        throw new Error(data.error);
      }
      return data; // Return full response for tool calls
    }
  } catch (error) {
    if (error instanceof OverloadedError) {
      throw error;
    }
    const apiError = error instanceof Error ? error : new Error(String(error));
    onError?.(apiError);
    throw apiError;
  }
}

/**
 * Send chat request and get JSON response (for non-streaming cases)
 */
export async function sendChatRequest(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: prepareMessagesForSend(request.messages),
      timeoutExpired: request.timeoutExpired || false,
    }),
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response.json();
}
