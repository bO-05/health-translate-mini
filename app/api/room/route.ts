import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createEdgeClient } from '@/lib/supabase/server'; // We'll create this utility file next

export const runtime = 'edge';

/**
 * Generates a random uppercase room code of the specified length.
 *
 * @param length - The number of characters in the generated code. Defaults to 6.
 * @returns A randomly generated uppercase string suitable for use as a room code.
 */
function generateRoomCode(length: number = 6): string {
  // Use crypto.randomUUID for better randomness
  return crypto.randomUUID().replace(/-/g, '').slice(0, length).toUpperCase();
}

/**
 * Handles POST requests to create a new room with a unique room code.
 *
 * Attempts to generate and insert a unique room code into the 'rooms' table, retrying up to five times if a code collision occurs. Returns the newly created room's ID and code on success, or an error response if creation fails.
 *
 * @returns A JSON response containing the new room data with status 201, or an error message with status 500 or 503.
 *
 * @remark Returns a 503 status if unable to generate a unique room code after five attempts.
 */
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

/**
 * Handles GET requests to retrieve a room by its code.
 *
 * Expects a `room_code` or `roomCode` query parameter and returns the corresponding room data if found.
 *
 * @returns A JSON response containing the room data with status 200, or an error message with status 400, 404, or 500.
 */
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