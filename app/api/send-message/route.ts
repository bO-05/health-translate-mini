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

  // Trim and validate input
  const trimmedRoomId = typeof roomId === 'string' ? roomId.trim() : '';
  const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';
  const trimmedText = typeof text === 'string' ? text.trim() : '';
  const trimmedLang = typeof lang === 'string' ? lang.trim() : '';

  // ISO-639/BCP-47 language code regex (e.g., en, en-US, es, fr, zh-CN)
  const langCodeRegex = /^[a-z]{2,3}(-[A-Z]{2})?$/;

  // UUID regex
  const uuidRegex = /^[0-9a-f-]{36}$/i;

  if (!trimmedRoomId || !uuidRegex.test(trimmedRoomId)) {
    return NextResponse.json({ error: 'Invalid or missing roomId (must be a UUID)' }, { status: 400 });
  }
  if (!trimmedUserId || !uuidRegex.test(trimmedUserId)) {
    return NextResponse.json({ error: 'Invalid or missing userId (must be a UUID)' }, { status: 400 });
  }
  if (!trimmedText) {
    return NextResponse.json({ error: 'Invalid or missing text' }, { status: 400 });
  }
  if (!trimmedLang || !langCodeRegex.test(trimmedLang)) {
    return NextResponse.json({ error: 'Invalid or missing lang (must be ISO-639/BCP-47 code, e.g., en, en-US)' }, { status: 400 });
  }

  // Check if roomId exists before inserting
  const { data: roomExists, error: roomError } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', trimmedRoomId)
    .single();
  if (roomError) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error checking room existence:', roomError);
      return NextResponse.json({ error: 'Database error while checking room existence', details: roomError.message }, { status: 500 });
    } else {
      console.error('Error checking room existence');
      return NextResponse.json({ error: 'Database error while checking room existence' }, { status: 500 });
    }
  }
  if (!roomExists) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        room_id: trimmedRoomId,
        sender_user_id: trimmedUserId,
        original_text: trimmedText,
        original_lang: trimmedLang,
      })
      .select('id, timestamp')
      .single();

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error sending message:', error);
        return NextResponse.json({ error: 'Failed to send message', details: error.message }, { status: 500 });
      } else {
        console.error('Error sending message');
        return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
      }
    }

    return NextResponse.json({ message: 'Message sent successfully', data }, { status: 201 });
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Unexpected error sending message:', e);
      return NextResponse.json({ error: 'Unexpected error sending message', details: e.message }, { status: 500 });
    } else {
      console.error('Unexpected error sending message');
      return NextResponse.json({ error: 'Unexpected error sending message' }, { status: 500 });
    }
  }
} 