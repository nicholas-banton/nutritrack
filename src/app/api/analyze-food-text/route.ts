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
  let description = '';
  try {
    const body = await req.json();
    description = body.description;
    
    if (!description || typeof description !== 'string') {
      return NextResponse.json({ error: 'Please provide a food description' }, { status: 400 });
    }
    
    if (description.trim().length === 0) {
      return NextResponse.json({ error: 'Food description cannot be empty' }, { status: 400 });
    }

    console.log('[ANALYZE_FOOD] Processing text input:', {
      descriptionLength: description.length,
      timestamp: new Date().toISOString(),
    });

    let result;
    try {
      const response = await ai.generate({
        model: 'googleai/gemini-2.5-flash',
        output: { schema: FoodResultSchema },
        prompt: `You are a professional nutritionist. The user described what they ate: "${description}". 
Estimate the total nutrition for everything described and return a JSON object with:
- foodName: a concise name (string)
- calories: total kcal (number)
- proteinGrams: total protein (number)
- carbsGrams: total carbs (number)
- fatGrams: total fat (number)
- portionSizeGrams: estimated total weight in grams (number)
Be accurate and account for all items mentioned. Return valid JSON only.`,
      });
      result = response.output;
    } catch (aiError: any) {
      console.error('[ANALYZE_FOOD] Genkit/AI Error:', {
        message: aiError.message,
        code: aiError.code,
        status: aiError.status,
        details: aiError.details || aiError.toString(),
      });
      
      // Provide specific error messages based on the type of error
      if (aiError.message?.includes('API') || aiError.message?.includes('401')) {
        return NextResponse.json(
          { error: 'AI service authentication failed. Please try again later.' },
          { status: 503 }
        );
      }
      if (aiError.message?.includes('rate limit') || aiError.code === 429) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a moment and try again.' },
          { status: 429 }
        );
      }
      throw aiError;
    }

    if (!result) {
      console.error('[ANALYZE_FOOD] AI returned null/undefined output for description:', description);
      return NextResponse.json(
        { error: 'Could not analyze the food description. Please be more specific or try a different description.' },
        { status: 500 }
      );
    }

    // Validate the output schema
    try {
      const validated = FoodResultSchema.parse(result);
      console.log('[ANALYZE_FOOD] Successfully analyzed:', { foodName: validated.foodName });
      return NextResponse.json(validated);
    } catch (validationError: any) {
      console.error('[ANALYZE_FOOD] Schema validation failed:', {
        output: result,
        error: validationError.message,
      });
      return NextResponse.json(
        { error: 'AI response was invalid. Please try a different description.' },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('[ANALYZE_FOOD] Unexpected error:', {
      description: description.substring(0, 100),
      error: e.message,
      stack: e.stack?.substring(0, 500),
      name: e.name,
    });
    const errorMessage = e.message || 'Failed to analyze food description. Please try again.';
    const status = e.status || 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
