import { NextRequest } from 'next/server';

// Re-use or adapt this from the original translate route
const languageCodeToName: { [key: string]: string } = {
  'en': 'English', 'es': 'Spanish', 'id': 'Indonesian', 'zh': 'Chinese',
  'fr': 'French', 'de': 'German', 'ja': 'Japanese', 'ko': 'Korean',
  'pt': 'Portuguese', 'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi'
  // Add more as needed based on your supported languages
};

// Helper to send SSE messages
function sendSseMessage(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: any) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: NextRequest) {
  try {
    const { text, targetLang, sourceLang } = await request.json();

    if (!text || !targetLang) {
      return new Response(JSON.stringify({ error: 'Missing text or targetLang' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    const normalizedTargetLang = targetLang.toLowerCase().split('-')[0];
    if (!languageCodeToName[normalizedTargetLang]) {
      return new Response(JSON.stringify({ error: `Unsupported target language: ${targetLang}` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const mistralApiKey = process.env.MISTRAL_API_KEY;
    if (!mistralApiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const startTime = Date.now();
        console.log(`[SSE Stream ${startTime}] Started.`);
        try {
          sendSseMessage(controller, 'status', { message: 'Translation process started.' });

          const targetLanguageName = languageCodeToName[normalizedTargetLang] || targetLang;
          const systemPrompt = `You are an expert medical translator. Translate the following text for medical and healthcare contexts to ${targetLanguageName}. Ensure accuracy with medical terminology. Respond ONLY with the translated text. Do not include any additional explanations, introductions, or conversational remarks.`;
          const model = 'mistral-medium-latest';

          sendSseMessage(controller, 'status', { message: `Translating to ${targetLanguageName} using ${model}...` });
          // console.log(`[SSE Stream ${startTime}] Sending to Mistral (${model}). Text: ${text.substring(0,30)}...`); // Commented out for privacy
          const mistralApiStartTime = Date.now();

          const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${mistralApiKey}`,
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Source language: ${sourceLang || 'auto-detect'}. Text to translate: ${text}` }
              ],
              temperature: 0.1,
              max_tokens: 2000,
            }),
          });

          const mistralApiEndTime = Date.now();
          console.log(`[SSE Stream ${startTime}] Mistral API call duration: ${(mistralApiEndTime - mistralApiStartTime) / 1000}s`);

          if (!mistralResponse.ok) {
            const errorData = await mistralResponse.text();
            console.error(`[SSE Stream ${startTime}] Mistral API error: ${mistralResponse.status}`, errorData);
            sendSseMessage(controller, 'error', { message: 'Mistral API error', details: errorData, status: mistralResponse.status });
            return;
          }

          const data = await mistralResponse.json();
          console.log(`[SSE Stream ${startTime}] Received data from Mistral.`);

          if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
            console.error(`[SSE Stream ${startTime}] Unexpected API response format from Mistral:`, data);
            sendSseMessage(controller, 'error', { message: 'Unexpected API response format from Mistral' });
            return;
          }

          const translatedText = data.choices[0].message.content.trim();
          console.log(`[SSE Stream ${startTime}] Sending full_translation event.`);
          sendSseMessage(controller, 'full_translation', { translatedText, sourceText: text });
          console.log(`[SSE Stream ${startTime}] Sending status: Translation complete event.`);
          sendSseMessage(controller, 'status', { message: 'Translation complete.' });

        } catch (error) {
          const catchTime = Date.now();
          console.error(`[SSE Stream ${startTime}] Error during translation stream (caught at ${catchTime}):`, error);
          let errorMessage = 'Internal Server Error in stream';
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          try {
            // Check if controller is still usable before sending error
            if (controller.desiredSize !== null && controller.desiredSize > 0) {
              sendSseMessage(controller, 'error', { message: 'Failed to translate text', details: errorMessage });
            }
          } catch (e) {
            console.error("Failed to send error message on stream", e);
          }
        } finally {
          // Ensure stream is closed
          try {
            if (controller.desiredSize !== null) { // Check if it's not already closed/errored out
                 console.log(`[SSE Stream ${startTime}] Sending 'end' event in finally block.`);
                 sendSseMessage(controller, 'end', { message: 'Translation stream ended.' });
                 controller.close();
            }
          } catch(e) {
             console.warn("Controller likely already closed or in an errored state:", e);
             // Attempt to close if not already, otherwise log
             if (controller.desiredSize !== null) {
                try { controller.close(); } catch (closeError) { console.error("Error closing controller in finally:", closeError); }
             }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Useful for Nginx environments
      },
    });

  } catch (error) {
    console.error('Error in translate-stream route setup:', error);
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: 'An unexpected error occurred setting up the stream', details: errorMessage }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const runtime = 'edge'; 