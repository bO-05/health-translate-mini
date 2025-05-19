import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createEdgeClient } from '@/lib/supabase/server';
import { supportedLanguages } from '@/lib/constants'; // Import shared languages

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

  // UUID regex
  const uuidRegex = /^[0-9a-f-]{36}$/i;

  if (!trimmedRoomId || !uuidRegex.test(trimmedRoomId)) {
    return NextResponse.json({ error: 'Invalid or missing roomId (must be a UUID)' }, { status: 400 });
  }
  if (!trimmedUserId || !uuidRegex.test(trimmedUserId)) {
    return NextResponse.json({ error: 'Invalid or missing userId (must be a UUID)' }, { status: 400 });
  }
  if (!trimmedText) {
    return NextResponse.json({ error: 'Message text cannot be empty.' }, { status: 400 });
  }

  // Validate lang format and against supported languages (checking the base 2-letter code)
  const langBase = trimmedLang.split('-')[0];
  const langCodeRegex = /^[a-z]{2}$/i; // Simplified for base code check

  if (!trimmedLang || !langCodeRegex.test(langBase) || !supportedLanguages.some(l => l.mistralCode === langBase)) {
    return NextResponse.json({ error: `Invalid or unsupported language code: '${trimmedLang}'. Must be a supported 2-letter language code.` }, { status: 400 });
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