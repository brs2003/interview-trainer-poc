import { NextRequest, NextResponse } from 'next/server';
import { callOpenRouter, callOpenRouterStream } from '@/lib/openrouter';
import { ChatMessage } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    // Check environment key presence early
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          error: 'OPENROUTER_API_KEY is not configured on the server. Please check your .env.local file.',
          code: 'MISSING_API_KEY',
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { messages, options, stream } = body as {
      messages: ChatMessage[];
      options?: { model?: string; max_tokens?: number; temperature?: number };
      stream?: boolean;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request payload: "messages" array is required and cannot be empty.' },
        { status: 400 }
      );
    }

    const origin = req.headers.get('origin') || req.headers.get('referer') || 'http://localhost:3000';

    if (stream) {
      const upstream = await callOpenRouterStream(messages, {
        ...options,
        siteUrl: origin,
      });

      const upstreamReader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      const textStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let buffer = '';
          try {
            while (true) {
              const { done, value } = await upstreamReader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              // Keep the last (possibly incomplete) line in the buffer
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;

                const payload = trimmed.slice('data:'.length).trim();
                if (payload === '[DONE]') {
                  controller.close();
                  return;
                }

                try {
                  const json = JSON.parse(payload);
                  const delta = json.choices?.[0]?.delta?.content;
                  if (delta) {
                    controller.enqueue(encoder.encode(delta));
                  }
                } catch {
                  // Ignore malformed/partial SSE chunks
                }
              }
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
        cancel() {
          upstreamReader.cancel().catch(() => {});
        },
      });

      return new Response(textStream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const result = await callOpenRouter(messages, {
      ...options,
      siteUrl: origin,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    console.error('API Route /api/llm error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during LLM processing.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
