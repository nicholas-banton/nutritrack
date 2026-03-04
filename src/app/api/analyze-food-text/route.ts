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
        model: 'googleai/gemini-1.5-flash',
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
      console.log('[ANALYZE_FOOD] AI response received successfully:', { foodName: result?.foodName });
    } catch (aiError: any) {
      const errorMessage = aiError.message || aiError.toString();
      const errorCode = aiError.code || 'UNKNOWN';
      const errorStatus = aiError.status || 'NO_STATUS';
      
      console.error('[ANALYZE_FOOD] Genkit/AI Error Details:', {
        message: errorMessage,
        code: errorCode,
        status: errorStatus,
        fullError: JSON.stringify(aiError, null, 2).substring(0, 500),
      });
      
      // More precise error detection
      if (errorMessage.includes('API key') || errorMessage.includes('authentication') || errorMessage.includes('401') || errorMessage.includes('UNAUTHENTICATED')) {
        return NextResponse.json(
          { error: 'AI service authentication failed. Please check the API key configuration.' },
          { status: 503 }
        );
      }
      if (errorMessage.includes('rate limit') || errorCode === 429 || errorStatus === 429) {
        return NextResponse.json(
          { error: 'Too many requests to AI service. Please wait a moment and try again.' },
          { status: 429 }
        );
      }
      if (errorMessage.includes('Quota') || errorMessage.includes('quota')) {
        return NextResponse.json(
          { error: 'AI service quota exceeded. Please try again later.' },
          { status: 503 }
        );
      }
      if (errorMessage.includes('model') || errorMessage.includes('not found')) {
        return NextResponse.json(
          { error: 'AI model not available. Please try again later.' },
          { status: 503 }
        );
      }
      
      // If it's not a known error, throw it for the outer catch block
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
