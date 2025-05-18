# HealthTranslateMini

HealthTranslateMini is a web application designed for real-time speech-to-speech translation, with a focus on medical and healthcare contexts. It allows users to speak in one language, see the transcript, have it translated into a target language, and then hear the translation spoken aloud.

The application is built using:
*   Next.js 14 (App Router)
*   TypeScript
*   Tailwind CSS
*   Vercel Edge Functions for backend APIs

Core functionalities are powered by:
*   **Speech-to-Text (STT):** Browser's Web Speech API
*   **Translation:** Mistral AI API
*   **Text-to-Speech (TTS):** ElevenLabs API

## Key Features

*   🎙️ **Real-time Speech-to-Text:** Captures audio via microphone and provides live transcription.
*   🌍 **Medical Context Translation:** Translates transcribed text using Mistral AI, with prompts tailored for medical accuracy.
*   🗣️ **Text-to-Speech Output:** Synthesizes translated text into audible speech using ElevenLabs.
*   ↔️ **Language Selection:** Allows users to select source and target languages from a predefined list.
*   🔄 **Swap Languages:** Quickly interchange source and target language selections.
*   📋 **Transcript Display:** Shows source and translated text in clear, readable panes.
*   ✂️ **Copy to Clipboard:** Easily copy transcripts with visual feedback on success/failure.
*   🎨 **Responsive UI:** Clean and intuitive interface that adapts to different screen sizes.
*   🔒 **API Security:** API keys managed via server-side environment variables.
*   ✔️ **Input Validation:** Checks for supported languages and required inputs in API routes.
*   ⚙️ **Robust Frontend Logic:** Improved reliability for translation requests (AbortController) and UI state management.

## Environment Setup

To run this project locally, you'll need to set up API keys for the translation and text-to-speech services.

1.  **Copy the example environment file:**
    ```bash
    cp .env.example .env.local
    ```
2.  **Edit `.env.local`** and add your API keys:
    ```env
    MISTRAL_API_KEY=your_mistral_api_key_here
    ELEVEN_API_KEY=your_elevenlabs_api_key_here
    # NEXT_PUBLIC_SUPPORTED_LANGS can be set here if needed, defaults are in app/page.tsx
    ```
    *   `MISTRAL_API_KEY`: Your API key for Mistral AI.
    *   `ELEVEN_API_KEY`: Your API key for ElevenLabs.

## Getting Started

Follow these steps to get the project running on your local machine:

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd HealthTranslateMini
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up your environment variables** as described in the "Environment Setup" section above.
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
5.  Open your browser and navigate to `http://localhost:3000`.

## Project Structure

A brief overview of the key files and directories:

*   `app/page.tsx`: Main frontend page component, managing UI and state.
*   `app/api/translate/route.ts`: Edge Function for Mistral AI translation.
*   `app/api/tts/route.ts`: Edge Function for ElevenLabs TTS.
*   `components/MicButton.tsx`: Component for microphone input and STT.
*   `components/TranscriptPane.tsx`: Component for displaying text panes.
*   `docs/`: Contains project documentation like progress reports and architecture details.

Refer to `docs/document-tree.txt` for a more detailed project structure. 