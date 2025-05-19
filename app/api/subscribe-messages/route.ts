import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createEdgeClient } from '@/lib/supabase/server';
import { RealtimeChannel } from '@supabase/supabase-js';

export const runtime = 'edge';

// Helper function to call Mistral for translation - placeholder
// In a real app, this would be a robust call to your translation service/route
async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  // This is a placeholder. Ideally, you'd call your existing /api/translate route
  // or a shared translation utility function.
  console.log(`TRANSLATE_TEXT_DEBUG: Translating from ${sourceLang} to ${targetLang}: "${text}"`);
  if (process.env.MISTRAL_API_KEY) {
    try {
      const mistralPayload = {
        model: 'mistral-small-latest', // or your preferred model
        messages: [
          {
            role: 'system',
            content: `Translate the following medical text from ${sourceLang} to ${targetLang}. Be accurate with medical terminology.`
          },
          { role: 'user', content: text }
        ]
      };

      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify(mistralPayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Mistral API Error:', response.status, errorBody);
        return `[Translation Error: ${response.status}]`;
      }
      const result = await response.json();
      const translated = result.choices[0]?.message?.content.trim();
      if (translated) {
          console.log(`TRANSLATE_TEXT_DEBUG: Translated to: "${translated}"`);
          return translated;
      } else {
          console.error('Mistral API Error: Empty translation content', result);
          return '[Translation Error: Empty content]';
      }
    } catch (error: any) {
      console.error('Error calling Mistral API:', error);
      return `[Translation Error: ${error.message}]`;
    }
  } else {
    console.warn('MISTRAL_API_KEY not set. Returning original text.');
    return `[No API Key] ${text}`;
  }
}


export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createEdgeClient(cookieStore);
  const { searchParams } = new URL(req.url);

  const roomId = searchParams.get('roomId');
  const myUserId = searchParams.get('myUserId'); // e.g., "patient" or "provider"
  const myLang = searchParams.get('myLang');     // Language the current user understands / wants to see translations in
  // const targetLang = searchParams.get('targetLang'); // Language of the *other* user (this is implicitly original_lang of incoming message)

  if (!roomId || !myUserId || !myLang) {
    return NextResponse.json(
      { error: 'Missing required query parameters: roomId, myUserId, myLang' },
      { status: 400 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const channelName = `room-${roomId}`;
      let realtimeChannel: RealtimeChannel;
      let isControllerClosed = false; // Flag to track controller state

      const handleNewMessage = async (payload: any) => {
        if (isControllerClosed) {
          console.log('SSE: Controller closed, skipping message processing for payload:', payload);
          return;
        }
        console.log('SSE: New message event from Supabase:', JSON.stringify(payload, null, 2));
        const newMessage = payload.new;

        if (newMessage && newMessage.sender_user_id !== myUserId) {
          console.log(`SSE: Processing message ID ${newMessage.id} from other user ${newMessage.sender_user_id}`);
          try {
            let translatedText = newMessage.original_text;
            if (newMessage.original_lang !== myLang) {
              console.log(`SSE: Message ID ${newMessage.id} needs translation from ${newMessage.original_lang} to ${myLang}.`);
              translatedText = await translateText(newMessage.original_text, newMessage.original_lang, myLang);
              console.log(`SSE: Message ID ${newMessage.id} translation result: "${translatedText.substring(0, 100)}..."`);
            }

            const messageData = {
              id: newMessage.id,
              from: newMessage.sender_user_id,
              originalText: newMessage.original_text,
              originalLang: newMessage.original_lang,
              translatedText: translatedText,
              myLang: myLang,
              timestamp: newMessage.timestamp,
            };
            
            const eventString = `data: ${JSON.stringify(messageData)}\n\n`;
            console.log(`SSE: Enqueuing event for message ID ${newMessage.id}: ${eventString.trim()}`);
            controller.enqueue(eventString);
            console.log(`SSE: Successfully enqueued event for message ID ${newMessage.id}`);

          } catch (error: any) {
            console.error(`SSE: Error processing message ID ${newMessage.id}:`, error);
            // Optionally, inform the client about the error, though this might be noisy
            // if (!isControllerClosed) {
            //   controller.enqueue(`event: error\ndata: ${JSON.stringify({ message: "Error processing message", error: error.message })}\n\n`);
            // }
            // Decide if a single message processing error should close the whole stream.
            // For now, let's not close it here, to allow future messages.
          }
        } else if (newMessage) {
          console.log(`SSE: Ignoring message ID ${newMessage.id} from self (user ${myUserId})`);
        } else {
          console.warn('SSE: Received payload.new but it was undefined or null.', payload);
        }
      };

      realtimeChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          handleNewMessage
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`Successfully subscribed to Supabase Realtime channel: ${channelName}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`Error status for Supabase Realtime channel ${channelName}: ${status}`);
            if (!isControllerClosed) {
              controller.error(new Error(`Supabase Realtime channel error: ${status}`));
              controller.close();
              isControllerClosed = true;
              clearInterval(keepAliveInterval);
            }
          } else {
            console.log(`Supabase Realtime status for ${channelName}: ${status}`);
          }
        });

      // Keep-alive: send a comment event every 20 seconds to prevent timeout
      const keepAliveInterval = setInterval(() => {
        if (!isControllerClosed) { // Check before enqueuing
          controller.enqueue(':keepalive\n\n');
        }
      }, 20000);

      // Cleanup on stream cancellation (client disconnects)
      return () => {
        console.log(`Client disconnected. Unsubscribing from Supabase Realtime channel: ${channelName}`);
        clearInterval(keepAliveInterval);
        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
        }
        if (!isControllerClosed) {
          // controller.close(); // Controller might be closed by client or by an error already
          isControllerClosed = true;
        }
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 