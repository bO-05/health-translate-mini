import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createEdgeClient } from '@/lib/supabase/server';

export const runtime = 'edge';

interface SendMessagePayload {
  roomId: string;
  userId: string;
  text: string;
  lang: string;
}

// POST /api/send-message - Send a message to a room
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createEdgeClient(cookieStore);

  let payload: SendMessagePayload;
  try {
    payload = await req.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { roomId, userId, text, lang } = payload;

  if (!roomId || typeof roomId !== 'string' || roomId.length === 0) {
    return NextResponse.json({ error: 'Invalid or missing roomId' }, { status: 400 });
  }
  // For this prototype, userId is a client-supplied string like "patient" or "provider".
  // In a production app, userId should be derived from an authenticated session (e.g., supabase.auth.getUser()).
  if (!userId || typeof userId !== 'string' || userId.length === 0) {
    return NextResponse.json({ error: 'Invalid or missing userId' }, { status: 400 });
  }
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Invalid or missing text' }, { status: 400 });
  }
  if (!lang || typeof lang !== 'string' || lang.length === 0) { // Basic lang code check, could be more specific (e.g., regex for xx-XX)
    return NextResponse.json({ error: 'Invalid or missing lang' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        sender_user_id: userId,
        original_text: text,
        original_lang: lang,
      })
      .select('id, timestamp') // Optionally return the created message ID and timestamp
      .single();

    if (error) {
      console.error('Error sending message:', error);
      return NextResponse.json({ error: 'Failed to send message', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Message sent successfully', data }, { status: 201 });
  } catch (e: any) {
    console.error('Unexpected error sending message:', e);
    return NextResponse.json({ error: 'Unexpected error sending message', details: e.message }, { status: 500 });
  }
} 