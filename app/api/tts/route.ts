import { NextRequest, NextResponse } from 'next/server';
import { synthesizeWithOpenRouterStream } from '@/lib/openrouterAudio';

async function handleSynthesis(text: string | null, voice: string | null) {
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      {
        error: 'OPENROUTER_API_KEY is not configured on the server. Please check your .env.local file.',
        code: 'MISSING_API_KEY',
      },
      { status: 500 }
    );
  }

  if (!text || !text.trim()) {
    return NextResponse.json(
      { error: 'Invalid request payload: non-empty "text" is required.' },
      { status: 400 }
    );
  }

  if (!voice || !voice.trim()) {
    return NextResponse.json(
      { error: 'Invalid request payload: "voice" is required.' },
      { status: 400 }
    );
  }

  try {
    const result = await synthesizeWithOpenRouterStream(text, voice);

    // Raw audio bytes streamed straight through, not JSON — the client plays
    // this via an <audio> element, which can start playback progressively as
    // bytes arrive instead of waiting for the full response.
    return new NextResponse(result.body, {
      headers: { 'Content-Type': result.contentType },
    });
  } catch (err: unknown) {
    console.error('API Route /api/tts error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during speech synthesis.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET so the client can point an <audio src> directly at this route and get
// native progressive HTTP audio streaming, instead of fetch()-ing a POST
// response into a Blob before any playback can start.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return handleSynthesis(searchParams.get('text'), searchParams.get('voice'));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { text, voice } = body as { text?: string; voice?: string };
  return handleSynthesis(text ?? null, voice ?? null);
}
