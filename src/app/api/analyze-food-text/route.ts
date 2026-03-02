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

    if (!output) return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    return NextResponse.json(output);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
