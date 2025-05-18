export const runtime = 'edge';

// TODO: Consider adding specific voice ID selection later if needed
// const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Example: Adam

export async function POST(req: Request) {
  const { text, targetLang } = await req.json();
  const requestStartTime = Date.now();
  const logPrefix = `[/api/tts RequestID: ${requestStartTime}]`;

  // console.log("[/api/tts] Received request - Text:", text ? text.substring(0, 50) + (text.length > 50 ? "..." : "") : "[No Text]", "TargetLang:", targetLang);
  // Sanitized logging:
  console.log(`${logPrefix} Received request - Text present: ${!!text}, Text length: ${text ? text.length : 0}, TargetLang: ${targetLang}`);

  if (!text) {
    console.error(`${logPrefix} Error: Text is required`);
    return new Response(JSON.stringify({ error: 'Text is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!targetLang) {
    console.error("[/api/tts] Error: Target language is required");
    return new Response(JSON.stringify({ error: 'Target language is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const supportedTtsLanguages = ['en', 'id', 'de', 'es', 'zh', 'ja', 'ko'];
  const normalizedTargetLang = targetLang.toLowerCase().split('-')[0];

  if (!supportedTtsLanguages.includes(normalizedTargetLang)) {
    console.error(`[/api/tts] Error: Unsupported target language: ${targetLang}. Supported are: ${supportedTtsLanguages.join(', ')}`);
    return new Response(JSON.stringify({ error: `Unsupported target language: ${targetLang}. Supported are: ${supportedTtsLanguages.join(', ')}` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const apiKey = process.env.ELEVEN_API_KEY;
  if (!apiKey) {
    console.error("[/api/tts] Error: ElevenLabs API key not configured (expected ELEVEN_API_KEY)");
    return new Response(JSON.stringify({ error: 'ElevenLabs API key not configured (expected ELEVEN_API_KEY)' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Determine ElevenLabs voice ID based on target language.
  // Using specific voice IDs provided by the user.
  let voiceId: string;
  const lang = normalizedTargetLang;

  switch (lang) {
    case 'en':
      voiceId = "NFG5qt843uXKj4pFvR7C"; // Adam Stone (English)
      break;
    case 'id':
      voiceId = "X8n8hOy3e8VLQnHTUcc5"; // Bram (Bahasa Indonesia)
      break;
    case 'de':
      voiceId = "kkJxCnlRCckmfFvzDW5Q"; // Alexander (German)
      break;
    case 'es':
      voiceId = "W5JElH3dK1UYYAiHH7uh"; // Martin Osborne - 2 (Spanish)
      break;
    case 'zh':
      voiceId = "WuLq5z7nEcrhppO0ZQJw"; // Martin Li (Chinese)
      break;
    case 'ja':
      voiceId = "Mv8AjrYZCBkdsmDHNwcB"; // Ishibashi (Japanese)
      break;
    case 'ko':
      voiceId = "jB1Cifc2UQbq1gR3wnb0"; // Bin (Korean) - Colon removed
      break;
    // Add more cases here if new languages/voices are added
    default:
      console.warn(`${logPrefix} No specific voice ID for targetLang: '${targetLang}'. Falling back to default English (Adam Stone).`);
      voiceId = "NFG5qt843uXKj4pFvR7C"; // Default to Adam Stone (English)
      break;
  }

  const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_22050_32&optimize_streaming_latency=3`;
  const requestBody = {
    text: text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  };

  console.log(`${logPrefix} Sending request to ElevenLabs: URL: ${elevenLabsUrl}, VoiceID: ${voiceId}, ModelID: ${requestBody.model_id}`);
  const elevenApiStartTime = Date.now();

  try {
    const response = await fetch(elevenLabsUrl, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });
    const elevenApiEndTime = Date.now();
    console.log(`${logPrefix} ElevenLabs API call duration: ${(elevenApiEndTime - elevenApiStartTime) / 1000}s. Status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`${logPrefix} ElevenLabs API error: ${response.status} ${response.statusText}. VoiceID used: ${voiceId}. Details:`, errorBody);
      return new Response(JSON.stringify({ error: `ElevenLabs API error: ${response.statusText}`, details: errorBody }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    // Stream the audio back
    if (response.body) {
      return new Response(response.body, {
        headers: { 
          'Content-Type': 'audio/mpeg',
          'Transfer-Encoding': 'chunked' // Ensure client knows it's a stream
        },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Empty response body from ElevenLabs' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error(`${logPrefix} Error calling ElevenLabs API:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: 'Failed to synthesize speech', details: errorMessage }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
} 