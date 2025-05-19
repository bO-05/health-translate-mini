import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createEdgeClient } from '@/lib/supabase/server';
import { RealtimeChannel } from '@supabase/supabase-js';

export const runtime = 'edge';

// Helper function to call Mistral for translation - placeholder
/**
 * Translates medical text from a source language to a target language using the Mistral API.
 *
 * If the Mistral API key is not set, returns the original text prefixed with a notice.
 * If the translation fails or the API returns an error, returns a string indicating the error.
 *
 * @param text - The text to translate.
 * @param sourceLang - The language code of the original text.
 * @param targetLang - The language code to translate the text into.
 * @returns The translated text, or an error message if translation is unavailable.
 *
 * @remark This function is specialized for medical text and prioritizes accuracy in medical terminology.
 */
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


/**
 * Handles GET requests to provide a Server-Sent Events (SSE) stream of translated chat messages for a specified room.
 *
 * Validates query parameters for room ID, user ID, and language code. Subscribes to a Supabase Realtime channel for new message events in the given room. For each new message not sent by the current user, translates the message text to the user's preferred language if necessary, and streams the result as an SSE event. Maintains a keep-alive mechanism and cleans up resources on disconnect or channel errors.
 *
 * @returns A Response object streaming SSE events with translated chat messages and metadata, or a JSON error response for invalid parameters.
 */
export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createEdgeClient(cookieStore);
  const { searchParams } = new URL(req.url);

  let roomId = searchParams.get('roomId');
  let myUserId = searchParams.get('myUserId');
  let myLang = searchParams.get('myLang');

  // Trim and validate
  roomId = roomId ? roomId.trim() : '';
  myUserId = myUserId ? myUserId.trim() : '';
  myLang = myLang ? myLang.trim() : '';

  const uuidRegex = /^[0-9a-f-]{36}$/i;
  const langCodeRegex = /^[a-z]{2,3}(-[A-Z]{2})?$/;

  if (!roomId || !uuidRegex.test(roomId)) {
    return NextResponse.json({ error: 'Invalid or missing roomId (must be a UUID)' }, { status: 400 });
  }
  if (!myUserId || !uuidRegex.test(myUserId)) {
    return NextResponse.json({ error: 'Invalid or missing myUserId (must be a UUID)' }, { status: 400 });
  }
  if (!myLang || !langCodeRegex.test(myLang)) {
    return NextResponse.json({ error: 'Invalid or missing myLang (must be ISO-639/BCP-47 code, e.g., en, en-US)' }, { status: 400 });
  }

  const textEncoder = new TextEncoder();
  let keepAliveInterval: NodeJS.Timeout;

  const stream = new ReadableStream({
    async start(controller) {
      const channelName = `room-${roomId}`;
      let realtimeChannel: RealtimeChannel;
      let isControllerClosed = false; // Flag to track controller state

      const handleNewMessage = async (payload: any) => {
        if (isControllerClosed) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('SSE: Controller closed, skipping message processing for payload:', payload);
          }
          return;
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log('SSE: New message event from Supabase:', JSON.stringify(payload, null, 2));
        }
        const newMessage = payload.new;

        if (newMessage && newMessage.sender_user_id !== myUserId) {
          if (process.env.NODE_ENV !== 'production') {
            console.log(`SSE: Processing message ID ${newMessage.id} from other user ${newMessage.sender_user_id}`);
          }
          try {
            let translatedText = newMessage.original_text;
            if (newMessage.original_lang !== myLang) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`SSE: Message ID ${newMessage.id} needs translation from ${newMessage.original_lang} to ${myLang}.`);
              }
              translatedText = await translateText(newMessage.original_text, newMessage.original_lang, myLang);
              if (process.env.NODE_ENV !== 'production') {
                console.log(`SSE: Message ID ${newMessage.id} translation result: "${translatedText.substring(0, 100)}..."`);
              }
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
            if (process.env.NODE_ENV !== 'production') {
              console.log(`SSE: Enqueuing event for message ID ${newMessage.id}: ${eventString.trim()}`);
            }
            controller.enqueue(textEncoder.encode(eventString));
            if (process.env.NODE_ENV !== 'production') {
              console.log(`SSE: Successfully enqueued event for message ID ${newMessage.id}`);
            }

          } catch (error: any) {
            if (process.env.NODE_ENV !== 'production') {
              console.error(`SSE: Error processing message ID ${newMessage.id}:`, error);
            }
          }
        } else if (newMessage) {
          if (process.env.NODE_ENV !== 'production') {
            console.log(`SSE: Ignoring message ID ${newMessage.id} from self (user ${myUserId})`);
          }
        } else {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('SSE: Received payload.new but it was undefined or null.', payload);
          }
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
            if (process.env.NODE_ENV !== 'production') {
              console.log(`Successfully subscribed to Supabase Realtime channel: ${channelName}`);
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (process.env.NODE_ENV !== 'production') {
              console.error(`Error status for Supabase Realtime channel ${channelName}: ${status}`);
            }
            if (!isControllerClosed) {
              supabase.removeChannel(realtimeChannel);
              controller.error(new Error(`Supabase Realtime channel error: ${status}`));
              controller.close();
              isControllerClosed = true;
              clearInterval(keepAliveInterval);
            }
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log(`Supabase Realtime status for ${channelName}: ${status}`);
            }
          }
        });

      // Keep-alive: send a comment event every 10 seconds to prevent timeout
      keepAliveInterval = setInterval(() => {
        if (!isControllerClosed) {
          controller.enqueue(textEncoder.encode(':keepalive\n\n'));
        }
      }, 10000);

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