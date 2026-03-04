import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(req: NextRequest) {
  try {
    const { description } = await req.json();
    if (!description) return NextResponse.json({ error: 'No description provided' }, { status: 400 });

    const { output } = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      output: { schema: FoodResultSchema },
      prompt: `You are a professional nutritionist. The user described what they ate: "${description}". 
Estimate the total nutrition for everything described and return:
- foodName: a concise summary of the meal
- calories: total kcal
- proteinGrams, carbsGrams, fatGrams: total macros
- portionSizeGrams: estimated total weight in grams
Be accurate and account for all items mentioned. Return only JSON.`,
    });

    if (!output) {
      console.error('[ANALYZE_FOOD] AI returned no output for description:', description);
      return NextResponse.json({ error: 'AI could not analyze the food description. Please try again.' }, { status: 500 });
    }
    return NextResponse.json(output);
  } catch (e: any) {
    console.error('[ANALYZE_FOOD] Error analyzing food:', {
      description: req.body,
      error: e.message,
      stack: e.stack,
      name: e.name,
    });
    const errorMessage = e.message || 'Failed to analyze food. Please try again.';
    const status = e.status || 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
