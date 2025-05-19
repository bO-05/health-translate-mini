export const supportedLanguages = [
  { code: 'en-US', name: 'English (US)', mistralCode: 'en' },
  { code: 'es-ES', name: 'Español (España)', mistralCode: 'es' },
  { code: 'id-ID', name: 'Bahasa Indonesia', mistralCode: 'id' },
  { code: 'zh-CN', name: '中文 (普通话)', mistralCode: 'zh' },
  { code: 'fr-FR', name: 'Français', mistralCode: 'fr' },
  { code: 'de-DE', name: 'Deutsch', mistralCode: 'de' },
  { code: 'ja-JP', name: '日本語', mistralCode: 'ja' },
  { code: 'ko-KR', name: '한국어', mistralCode: 'ko' },
  // Add more from NEXT_PUBLIC_SUPPORTED_LANGS if they were intended to be dynamic
  // For now, these are the statically defined ones from app/page.tsx
];

// If there was a distinct supportedTtsLanguages array, it would go here.
// Based on current code, TTS language support is primarily through voice ID mapping in the API route. 