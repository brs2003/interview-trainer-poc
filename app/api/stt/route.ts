import { NextRequest, NextResponse } from 'next/server';
import { transcribeWithOpenRouter } from '@/lib/openrouterAudio';

// Maps a MediaRecorder mimeType to the container "format" string OpenRouter's
// transcription endpoint expects.
function formatFromMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  const subtype = base.split('/')[1] || 'webm';
  if (subtype === 'mp4') return 'm4a';
  return subtype;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          error: 'OPENROUTER_API_KEY is not configured on the server. Please check your .env.local file.',
          code: 'MISSING_API_KEY',
        },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const audio = form.get('audio');

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { error: 'Invalid request payload: an "audio" file field is required.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const base64Audio = buffer.toString('base64');
    const format = formatFromMimeType(audio.type || 'audio/webm');

    const transcript = await transcribeWithOpenRouter(base64Audio, format);

    return NextResponse.json({ success: true, transcript });
  } catch (err: unknown) {
    console.error('API Route /api/stt error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during transcription.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
