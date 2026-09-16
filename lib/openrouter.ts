import { ChatMessage } from './types';

export const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.6';
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterCallOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  siteUrl?: string;
}

/**
 * Server-side helper to call OpenRouter OpenAI-compatible chat completion endpoint.
 * Ensures OPENROUTER_API_KEY is read from process.env.OPENROUTER_API_KEY and never exposed.
 */
export async function callOpenRouter(
  messages: ChatMessage[],
  options: OpenRouterCallOptions = {}
) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OPENROUTER_API_KEY is missing or invalid in server environment. Please configure .env.local.');
  }

  const model = options.model || OPENROUTER_MODEL;
  const siteUrl = options.siteUrl || 'http://localhost:3000';

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': siteUrl,
      'X-Title': 'Interview Trainer PoC',
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetail = `OpenRouter API request failed with status ${response.status}`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error?.message) {
        errorDetail = `OpenRouter Error: ${errJson.error.message}`;
      }
    } catch {
      if (errorText) errorDetail = `OpenRouter Error (${response.status}): ${errorText}`;
    }
    throw new Error(errorDetail);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenRouter response returned an empty completion content.');
  }

  return content a  s string;
}

/**
 * Server-side helper to call OpenRouter with streaming enabled. Returns the raw
 * fetch Response so the caller can read the SSE body incrementally.
 */
export async function callOpenRouterStream(
  messages: ChatMessage[],
  options: OpenRouterCallOptions = {}
): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OPENROUTER_API_KEY is missing or invalid in server environment. Please configure .env.local.');
  }

  const model = options.model || OPENROUTER_MODEL;
  const siteUrl = options.siteUrl || 'http://localhost:3000';

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': siteUrl,
      'X-Title': 'Interview Trainer PoC',
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetail = `OpenRouter API request failed with status ${response.status}`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error?.message) {
        errorDetail = `OpenRouter Error: ${errJson.error.message}`;
      }
    } catch {
      if (errorText) errorDetail = `OpenRouter Error (${response.status}): ${errorText}`;
    }
    throw new Error(errorDetail);
  }

  if (!response.body) {
    throw new Error('OpenRouter streaming response did not include a readable body.');
  }

  return response;
}
