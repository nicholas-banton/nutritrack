import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI({ apiKey: 'AIzaSyDRPNrxp1pkyxOPDPprUQLhA-4bOx6adiw' })],
  model: 'googleai/gemini-2.5-flash',
});
