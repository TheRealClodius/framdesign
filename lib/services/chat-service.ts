/**
 * Chat API service
 */

import { parseApiError, OverloadedError } from "../errors";
import { prepareMessagesForSend } from "../message-utils";
import type { Message } from "../storage";

export interface ChatRequest {
  messages: Message[];
  timeoutExpired?: boolean;
  userId?: string;
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
  suggestions?: string[]; // AI-generated suggestions for this response
}

/**
 * Stream chat response from API
 * Returns ChatResponse when response is JSON (tool calls), void when streaming
 */
export async function streamChatResponse(
  request: ChatRequest,
  onChunk: (chunk: string) => void,
  onError?: (error: Error) => void,
  onStatus?: (status: string) => void
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
        userId: request.userId,
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

      // Buffer for parsing status events that may span chunks
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        // Add chunk to buffer
        buffer += chunk;

        // Parse status events from buffer
        const STATUS_START = "---STATUS---\n";
        const STATUS_END = "\n---ENDSTATUS---";
        let textToSend = "";
        let lastProcessedIdx = 0;
        
        while (buffer.includes(STATUS_START, lastProcessedIdx)) {
          const startIdx = buffer.indexOf(STATUS_START, lastProcessedIdx);
          const afterStart = startIdx + STATUS_START.length;
          const endIdx = buffer.indexOf(STATUS_END, afterStart);
          
          if (endIdx === -1) {
            // Status event spans multiple chunks, wait for more data
            // Keep text before the incomplete status event
            textToSend += buffer.substring(lastProcessedIdx, startIdx);
            buffer = buffer.substring(startIdx);
            lastProcessedIdx = 0;
            break;
          }
          
          // Add text before this status event
          textToSend += buffer.substring(lastProcessedIdx, startIdx);
          
          // Extract status JSON
          const statusJson = buffer.substring(afterStart, endIdx);
          try {
            const statusData = JSON.parse(statusJson);
            if (statusData.status && onStatus) {
              onStatus(statusData.status);
            }
          } catch (e) {
            console.warn("Failed to parse status event:", e);
          }
          
          // Move past this status event
          lastProcessedIdx = endIdx + STATUS_END.length;
        }
        
        // If we processed everything, add remaining text
        if (lastProcessedIdx === 0 && !buffer.includes(STATUS_START)) {
          // No incomplete status event, send all buffered text
          textToSend += buffer;
          buffer = "";
        } else if (lastProcessedIdx > 0 && !buffer.includes(STATUS_START, lastProcessedIdx)) {
          // Processed all complete status events, keep remaining buffer
          const remaining = buffer.substring(lastProcessedIdx);
          buffer = remaining;
        }

        // Send accumulated text (without status events)
        if (textToSend) {
          onChunk(textToSend);
        }
      }
      
      // Handle any remaining buffer content (shouldn't contain status events at this point)
      if (buffer) {
        onChunk(buffer);
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
