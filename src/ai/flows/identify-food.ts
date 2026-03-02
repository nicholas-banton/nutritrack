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
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      output: { schema: FoodResultSchema },
      prompt: [
        { media: { url: photoDataUri } },
        { text: `You are a professional nutritionist. Analyze this food photo and return estimated: foodName, calories (kcal), proteinGrams, carbsGrams, fatGrams, portionSizeGrams. Be specific with the food name. Return only JSON.` },
      ],
    });
    if (!output) throw new Error('No response from AI');
    return output;
  }
);
