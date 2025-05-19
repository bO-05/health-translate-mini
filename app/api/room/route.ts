import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createEdgeClient } from '@/lib/supabase/server'; // We'll create this utility file next

export const runtime = 'edge';

function generateRoomCode(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// POST /api/room - Create a new room
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createEdgeClient(cookieStore);

  let roomCode = generateRoomCode();
  let roomCreated = false;
  let attempts = 0;
  const maxAttempts = 5; // Avoid infinite loop in case of too many collisions (highly unlikely)
  let newRoom;

  while (!roomCreated && attempts < maxAttempts) {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({ room_code: roomCode })
        .select('id, room_code')
        .single();

      if (error) {
        if (error && error.code === '23505') { // Unique constraint violation
          roomCode = generateRoomCode(); // Regenerate code and retry
          attempts++;
          continue;
        }
        console.error('Error creating room:', error);
        return NextResponse.json({ error: 'Failed to create room', details: error.message }, { status: 500 });
      }
      newRoom = data;
      roomCreated = true;
    } catch (e: any) {
      console.error('Unexpected error creating room:', e);
      return NextResponse.json({ error: 'Unexpected error creating room', details: e.message }, { status: 500 });
    }
  }

  if (!roomCreated) {
    return NextResponse.json({ error: 'Failed to generate a unique room code after multiple attempts' }, { status: 500 });
  }

  return NextResponse.json(newRoom, { status: 201 });
}

// GET /api/room?room_code=XYZ - Join an existing room
export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createEdgeClient(cookieStore);
  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get('room_code') ?? searchParams.get('roomCode');

  if (!roomCode) {
    return NextResponse.json({ error: 'room_code (or roomCode) query parameter is required' }, { status: 400 });
  }

  try {
    const { data: room, error } = await supabase
      .from('rooms')
      .select('id, room_code')
      .eq('room_code', roomCode)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching room:', error);
      return NextResponse.json({ error: 'Failed to fetch room', details: error.message }, { status: 500 });
    }

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    return NextResponse.json(room, { status: 200 });
  } catch (e: any) {
    console.error('Unexpected error fetching room:', e);
    return NextResponse.json({ error: 'Unexpected error fetching room', details: e.message }, { status: 500 });
  }
} 