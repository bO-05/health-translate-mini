import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createEdgeClient } from '@/lib/supabase/server';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supportedLanguages } from '@/lib/constants'; // Import shared languages

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
            content: `Directly translate the following text from ${sourceLang} to ${targetLang}. Preserve medical terminology. Output only the translation itself, with no additional commentary or phrases.`
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

  let roomId = searchParams.get('roomId');
  let myUserId = searchParams.get('myUserId');
  let myLang = searchParams.get('myLang');

  // Trim and validate
  roomId = roomId ? roomId.trim() : '';
  myUserId = myUserId ? myUserId.trim() : '';
  myLang = myLang ? myLang.trim() : '';

  const uuidRegex = /^[0-9a-f-]{36}$/i;
  // const langCodeRegex = /^[a-z]{2,3}(-[A-Z]{2})?$/; // Keep for format, but also check against supported list

  if (!roomId || !uuidRegex.test(roomId)) {
    return NextResponse.json({ error: 'Invalid or missing roomId (must be a UUID)' }, { status: 400 });
  }
  if (!myUserId || !uuidRegex.test(myUserId)) {
    return NextResponse.json({ error: 'Invalid or missing myUserId (must be a UUID)' }, { status: 400 });
  }
  
  // Validate myLang format and against supported languages (checking the base 2-letter code)
  const myLangBase = myLang.split('-')[0];
  const langCodeRegex = /^[a-z]{2}$/i; // Simplified for base code check after split

  if (!myLang || !langCodeRegex.test(myLangBase) || !supportedLanguages.some(lang => lang.mistralCode === myLangBase)) {
    return NextResponse.json({ error: `Invalid or unsupported myLang: '${myLang}'. Must be a supported 2-letter language code.` }, { status: 400 });
  }

  const textEncoder = new TextEncoder();
  let keepAliveInterval: NodeJS.Timeout;

  const stream = new ReadableStream({
    async start(controller) {
      const channelName = `room-${roomId}`;
      let realtimeChannel: RealtimeChannel | null = null; // Initialize to null
      let isControllerClosed = false; // Flag to track controller state

      // Unified cleanup function
      const cleanupAndCloseController = async (error?: any) => {
        if (isControllerClosed) {
          // console.log("SSE: Cleanup already performed or in progress.");
          return;
        }
        isControllerClosed = true;
        // console.log("SSE: Performing cleanup and closing controller.");

        clearInterval(keepAliveInterval);

        if (realtimeChannel) {
          try {
            await supabase.removeChannel(realtimeChannel);
            // console.log("SSE: Supabase channel removed successfully.");
          } catch (removeErr) {
            console.error("SSE: Error removing Supabase channel during cleanup:", removeErr);
          }
          realtimeChannel = null;
        }

        try {
          if (error && controller.desiredSize !== null) { // Check if controller can still be used for error
            // console.log("SSE: Enqueuing final error before closing controller:", error);
            // controller.error(error); // This might be too late or cause issues if client already gone
          }
          // console.log("SSE: Closing controller.");
          controller.close();
        } catch (closeError) {
          // console.warn("SSE: Error closing controller during cleanup (might be already closed or in bad state):", closeError);
        }
      };

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
            let finalTranslatedLang = newMessage.original_lang; // Default to original
            if (newMessage.original_lang !== myLang) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`SSE: Message ID ${newMessage.id} needs translation from ${newMessage.original_lang} to ${myLang}.`);
              }
              translatedText = await translateText(newMessage.original_text, newMessage.original_lang, myLang);
              finalTranslatedLang = myLang; // Set to target language if translation happened
              if (process.env.NODE_ENV !== 'production') {
                console.log(`SSE: Message ID ${newMessage.id} translation result: "${translatedText.substring(0, 100)}..."`);
              }
            }

            const messageData = {
              id: newMessage.id,
              sender_user_id: newMessage.sender_user_id, // Corrected: from -> sender_user_id
              original_text: newMessage.original_text,    // Corrected: originalText -> original_text
              original_lang: newMessage.original_lang,    // Corrected: originalLang -> original_lang
              translated_text: translatedText,            // Corrected: translatedText -> translated_text
              translated_lang: finalTranslatedLang,       // Added: translated_lang based on whether translation occurred
              timestamp: newMessage.timestamp,
            };
            
            // Check *again* if controller is closed, in case it closed during async translation
            if (isControllerClosed) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`SSE: Controller closed before enqueuing translated message ID ${newMessage.id}. Aborting enqueue.`);
              }
              return; // Do not proceed
            }
            
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
            if (!isControllerClosed) { // Check before acting
              isControllerClosed = true; // Set flag immediately
              clearInterval(keepAliveInterval); // Clear interval immediately

              if (realtimeChannel) {
                supabase.removeChannel(realtimeChannel).catch(err => console.error("Error removing channel on error status:", err));
                realtimeChannel = null! as RealtimeChannel; // Clear reference after removal
              }
              try {
                controller.error(new Error(`Supabase Realtime channel error: ${status}`));
              } catch (e) {
                console.warn("Controller.error failed, possibly already closed during Supabase error handling:", e)
              }
              try {
                controller.close();
              } catch (e) {
                console.warn("Controller.close failed, possibly already closed during Supabase error handling:", e)
              }
              // isControllerClosed is already true
            }
          } else if (status === 'CLOSED') { // Explicitly handle CLOSED status if needed
            if (process.env.NODE_ENV !== 'production') {
              console.log(`Supabase Realtime channel ${channelName} was closed. Cleaning up.`);
            }
            cleanupAndCloseController();
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log(`Supabase Realtime status for ${channelName}: ${status}`);
            }
          }
        });

      // Keep-alive: send a comment event every 10 seconds to prevent timeout
      keepAliveInterval = setInterval(() => {
        if (isControllerClosed) {
          clearInterval(keepAliveInterval); // Ensure interval is stopped
          return;
        }
        try {
          // console.log("SSE: Sending keep-alive ping.");
          controller.enqueue(textEncoder.encode(':keepalive\n\n'));
        } catch (e) {
          console.warn("SSE: Error enqueuing keepalive, controller likely closed. Cleaning up.", e);
          cleanupAndCloseController(e); // Pass error for potential logging in cleanup
        }
      }, 10000);

      // Cleanup on stream cancellation (client disconnects)
      return () => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Client disconnected. Cleaning up resources for channel: ${channelName}. Current controller state (isControllerClosed): ${isControllerClosed}`);
        }
        cleanupAndCloseController();
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