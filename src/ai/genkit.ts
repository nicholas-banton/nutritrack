import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const apiKey = process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
  throw new Error('GOOGLE_AI_API_KEY environment variable is not set. Please add it to .env.local');
}

export const ai = genkit({
  plugins: [googleAI({ apiKey })],  model: 'googleai/gemini-2.5-flash',
});