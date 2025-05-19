# HealthTranslateMini

HealthTranslateMini is a web application designed for real-time speech-to-speech translation, with a focus on medical and healthcare contexts. It allows users to speak in one language, see the transcript, have it translated into a target language, and then hear the translation spoken aloud. It now also features a multi-user, real-time translated chat functionality.

The application is built using:
*   Next.js 14 (App Router)
*   TypeScript
*   Tailwind CSS
*   Vercel Edge Functions for backend APIs
*   Supabase for real-time chat backend (Postgres database & Realtime).

Core functionalities are powered by:
*   **Speech-to-Text (STT):** Browser's Web Speech API
*   **Translation:** Mistral AI API
*   **Text-to-Speech (TTS):** ElevenLabs API

## Key Features

*   🎙️ **Real-time Speech-to-Text:** Captures audio via microphone and provides live transcription.
*   🗣️ **Text-to-Speech Output:** Synthesizes translated text into audible speech using ElevenLabs (both for main translation and individual chat messages).
*   💬 **Multi-User Real-Time Chat:**
    *   Create or join chat rooms using simple room codes.
    *   Real-time, two-way translated messaging between users.
    *   In-chat language preferences: select your speaking language and the language you want incoming messages translated to.
    *   Integrated Speech-to-Text (STT) and Text-to-Speech (TTS) within the chat interface.
*   ↔️ **Language Selection:** Allows users to select source and target languages from a predefined list (for main translation and as defaults for chat), centralized in `lib/constants.ts`.
*   🔄 **Swap Languages:** Quickly interchange source and target language selections (for main translation).
*   📋 **Transcript Display:** Shows source and translated text in clear, readable panes (for main translation).
*   ✂️ **Copy to Clipboard:** Easily copy transcripts and room codes with visual feedback.
*   🎨 **Responsive UI:** Clean and intuitive interface that adapts to different screen sizes.
*   🔒 **API Security:** API keys managed via server-side environment variables.
*   ✔️ **Input Validation:** Checks for supported languages (from `lib/constants.ts`) and required inputs in API routes.
*   ⚙️ **Robust Frontend Logic:** Improved reliability for translation requests (AbortController) and UI state management. URI-encoded SSE parameters and guarded JSON parsing for SSE messages.

## Environment Setup

To run this project locally, you'll need to set up API keys for the translation, text-to-speech, and Supabase services.

1.  **Copy the example environment file:**
    ```bash
    cp .env.example .env.local
    ```
2.  **Edit `.env.local`** and add your API keys:
    ```env
    MISTRAL_API_KEY=your_mistral_api_key_here
    ELEVEN_API_KEY=your_elevenlabs_api_key_here
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
    # NEXT_PUBLIC_APP_VERSION=1.1.0 # Optional: For displaying app version in footer
    # NEXT_PUBLIC_SUPPORTED_LANGS can be set here if needed, defaults are in app/page.tsx (now lib/constants.ts)
    ```
    *   `MISTRAL_API_KEY`: Your API key for Mistral AI.
    *   `ELEVEN_API_KEY`: Your API key for ElevenLabs.
    *   `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL (required for chat features).
    *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase project anonymous key (required for chat features).

> **Note:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is exposed to the browser and is **not a secret key**. You must enable Row Level Security (RLS) in your Supabase project and define appropriate policies to prevent unauthorized access to your data. Never use the service role key in client-side code.

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
4.  **If using Supabase for chat:** Ensure your Supabase project has the `rooms` and `messages` tables set up as per the schema expected by the API routes and that Row Level Security is configured.
5.  **Run the development server:**
    ```bash
    npm run dev
    ```
6.  Open your browser and navigate to `http://localhost:3000`.

## Project Structure

```bash
HealthTranslateMini/
├── .cursorrules
├── .env.example
├── .env.local (User-managed - contains API keys)
├── .gitignore
├── app/
│   ├── api/
│   │   ├── room/
│   │   │   └── route.ts
│   │   ├── send-message/
│   │   │   └── route.ts
│   │   ├── subscribe-messages/
│   │   │   └── route.ts
│   │   ├── translate/       # For main translation tool
│   │   │   └── route.ts
│   │   ├── translate-stream/ # For main translation tool (SSE)
│   │   │   └── route.ts
│   │   └── tts/
│   │       └── route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── MicButton.tsx
│   └── TranscriptPane.tsx
├── lib/
│   ├── constants.ts
│   └── supabase/
│       └── server.ts
├── node_modules/ (Managed by npm)
├── .next/ (Build artifacts)
├── next-env.d.ts
├── next.config.mjs
├── package-lock.json
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Key File Descriptions

- **`app/page.tsx`**: Main page component, handles UI logic and state for both the core translation tool and the multi-user chat features. Imports supported languages from `lib/constants.ts`.
- **`app/layout.tsx`**: Root layout for the Next.js application.
- **`app/globals.css`**: Global styles.
- **`app/api/translate/route.ts`**: Edge function for handling translations via Mistral API (for the main translation tool). Validates languages against `lib/constants.ts`.
- **`app/api/translate-stream/route.ts`**: Edge function for streaming translation responses (used by the main translation tool). Validates languages against `lib/constants.ts`.
- **`app/api/tts/route.ts`**: Edge function for handling text-to-speech via ElevenLabs API.
- **`app/api/room/route.ts`**: Edge function for creating/joining chat rooms.
- **`app/api/send-message/route.ts`**: Edge function for sending chat messages. Validates language against `lib/constants.ts`.
- **`app/api/subscribe-messages/route.ts`**: Edge function for subscribing to chat messages via SSE, including on-the-fly translation for the listener. Validates language against `lib/constants.ts`.
- **`components/MicButton.tsx`**: Reusable UI component for microphone input.
- **`components/TranscriptPane.tsx`**: Reusable UI component for displaying text transcripts (used by the main translation tool).
- **`lib/constants.ts`**: Shared constants for the application, such as the `supportedLanguages` array.
- **`lib/supabase/server.ts`**: Utility for creating Supabase Edge client, used by chat-related API routes.
- **`public/`**: (Currently empty, for static assets if needed in the future)
- **`.env.local`**: For local environment variables (API keys). Not committed to Git.
- **`.env.example`**: Example structure for `.env.local`.
- **`next.config.mjs`**, **`postcss.config.js`**, **`tailwind.config.ts`**, **`tsconfig.json`**: Standard Next.js/Tailwind/TypeScript config files.
- **`package.json`**, **`package-lock.json`**: npm package management.
- **`.cursorrules`**: Cursor AI assistant project configuration (internal rules, not user-facing documentation).

The `docs/` directory is part of `.gitignore` and will not be pushed to the repository. 