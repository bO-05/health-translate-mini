import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge'; // Specify edge runtime

interface TranslationRequestBody {
  text: string;
  targetLang: string;
  sourceLang?: string; // Optional: Mistral can often auto-detect, but good to have
}

// Basic list of language codes Mistral might support (not exhaustive)
// Adapt this or use a more robust mapping if needed
const languageCodeToName: { [key: string]: string } = {
  'en': 'English',
  'es': 'Spanish',
  'id': 'Indonesian',
  'zh': 'Chinese',
  'fr': 'French',
  'de': 'German',
  'ja': 'Japanese',
  'ko': 'Korean',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ar': 'Arabic',
  'hi': 'Hindi'
  // Add more as needed based on your supported languages
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as TranslationRequestBody;
    const { text, targetLang, sourceLang } = body;

    if (!text || !targetLang) {
      return NextResponse.json({ error: 'Missing text or targetLang' }, { status: 400 });
    }

    const normalizedTargetLang = targetLang.toLowerCase().split('-')[0];
    if (!languageCodeToName[normalizedTargetLang]) {
      console.error(`Unsupported target language: ${targetLang}. Supported are: ${Object.keys(languageCodeToName).join(', ')}`);
      return NextResponse.json({ error: `Unsupported target language: ${targetLang}. Supported are: ${Object.keys(languageCodeToName).join(', ')}` }, { status: 400 });
    }

    const mistralApiKey = process.env.MISTRAL_API_KEY;
    if (!mistralApiKey) {
      console.error('MISTRAL_API_KEY is not set');
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const targetLanguageName = languageCodeToName[normalizedTargetLang] || targetLang;
    const systemPrompt = `You are an expert medical translator. Translate the following text for medical and healthcare contexts to ${targetLanguageName}. Ensure accuracy with medical terminology. Respond ONLY with the translated text. Do not include any additional explanations, introductions, or conversational remarks.`;
    
    // Adjust model as needed - check Mistral documentation for latest/best models for translation
    const model = 'mistral-medium-latest'; // Or other suitable model like mistral-large-latest

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Source language: ${sourceLang}. Text to translate: ${text}` }
        ],
        // temperature: 0.1, // Lower for more deterministic translation
        // max_tokens: 1000, // Adjust if needed
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Mistral API error:', response.status, errorData);
      return NextResponse.json({ error: 'Failed to translate text', details: errorData }, { status: response.status });
    }

    const data = await response.json();
    
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
        console.error('Mistral API response format unexpected:', data);
        return NextResponse.json({ error: 'Unexpected API response format' }, { status: 500 });
    }

    const translatedText = data.choices[0].message.content.trim();

    return NextResponse.json({ translatedText });

  } catch (error) {
    console.error('Error in translation route:', error);
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: 'An unexpected error occurred', details: errorMessage }, { status: 500 });
  }
} 