import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createEdgeClient } from '@/lib/supabase/server'; // We'll create this utility file next

export const runtime = 'edge';

function generateRoomCode(length: number = 6): string {
  // Use crypto.randomUUID for better randomness
  return crypto.randomUUID().replace(/-/g, '').slice(0, length).toUpperCase();
}

// POST /api/room - Create a new room
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createEdgeClient(cookieStore);

  let roomCode = generateRoomCode();
  let roomCreated = false;
  let attempts = 0;
  const maxAttempts = 5;
  let newRoom;

  while (!roomCreated && attempts < maxAttempts) {
    attempts++;
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({ room_code: roomCode })
        .select('id, room_code')
        .single();

      if (error && error.code === '23505') { // Unique constraint violation
        roomCode = generateRoomCode();
        continue;
      }
      if (error) {
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
    return NextResponse.json({ error: 'Failed to generate a unique room code after multiple attempts' }, { status: 503 });
  }

  return NextResponse.json(newRoom, { status: 201 });
}

// GET /api/room?room_code=XYZ - Join an existing room
export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createEdgeClient(cookieStore);
  const { searchParams } = new URL(req.url);
  let roomCode = searchParams.get('room_code') ?? searchParams.get('roomCode');

  if (!roomCode) {
    return NextResponse.json({ error: 'room_code (or roomCode) query parameter is required' }, { status: 400 });
  }
  roomCode = roomCode.toUpperCase();

  try {
    const { data: room, error } = await supabase
      .from('rooms')
      .select('id, room_code')
      .eq('room_code', roomCode)
      .single();

    if (error) {
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

// Explicitly handle OPTIONS requests
export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(null, {
    status: 204, // No Content
    headers: {
      'Access-Control-Allow-Origin': '*', // Adjust as necessary for your CORS policy
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 