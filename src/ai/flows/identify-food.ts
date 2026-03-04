'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const FoodResultSchema = z.object({
  foodName: z.string(),
  calories: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
  portionSizeGrams: z.number(),
});

const IdentifyFoodInputSchema = z.object({
  photoDataUri: z.string(),
});

export const identifyFood = ai.defineFlow(
  { name: 'identifyFood', inputSchema: IdentifyFoodInputSchema, outputSchema: FoodResultSchema },
  async ({ photoDataUri }) => {
    try {
      if (!photoDataUri) {
        throw new Error('No image data provided');
      }

      if (!photoDataUri.startsWith('data:image/')) {
        throw new Error('Invalid image format. Please ensure the image is a valid JPEG, PNG, or similar format.');
      }

      const { output } = await ai.generate({
        model: 'googleai/gemini-2.5-flash',
        output: { schema: FoodResultSchema },
        prompt: [
          { media: { url: photoDataUri } },
          { text: `You are a professional nutritionist. Analyze this food photo and return estimated: foodName, calories (kcal), proteinGrams, carbsGrams, fatGrams, portionSizeGrams. Be specific with the food name. Return only JSON.` },
        ],
      });

      if (!output) {
        throw new Error('AI could not analyze the image. Please try a clearer photo of the food.');
      }

      return output;
    } catch (e: any) {
      console.error('[IDENTIFY_FOOD] Error analyzing food image:', {
        error: e.message,
        stack: e.stack,
        name: e.name,
      });
      throw new Error(e.message || 'Failed to analyze food image. Please try again.');
    }
  }
);
