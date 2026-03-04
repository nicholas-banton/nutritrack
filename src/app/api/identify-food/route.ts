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
  let photoDataUri = '';
  try {
    const body = await req.json();
    photoDataUri = body.photoDataUri;

    // Validate input
    if (!photoDataUri || typeof photoDataUri !== 'string') {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    if (!photoDataUri.startsWith('data:image/')) {
      return NextResponse.json(
        { error: 'Invalid image format. Only JPEG, PNG, and similar formats are supported.' },
        { status: 400 }
      );
    }

    // Log the image size to help debug
    const imageSizeInMB = (photoDataUri.length / 1024 / 1024).toFixed(2);
    console.log('[IDENTIFY_FOOD_API] Processing image:', {
      imageSizeInMB,
      format: photoDataUri.substring(5, 20),
      timestamp: new Date().toISOString(),
    });

    // Make sure image isn't too large
    if (photoDataUri.length > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image is too large. Please use a smaller image (max 10MB).' },
        { status: 400 }
      );
    }

    let result;
    try {
      console.log('[IDENTIFY_FOOD_API] Calling Genkit AI...');
      const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        output: { schema: FoodResultSchema },
        prompt: [
          { media: { url: photoDataUri } },
          {
            text: `You are a professional nutritionist. Analyze this food photo carefully and return a JSON object with:
- foodName: specific name of the food/meal (string)
- calories: estimated total kcal (number)
- proteinGrams: estimated protein in grams (number)
- carbsGrams: estimated carbs in grams (number)
- fatGrams: estimated fat in grams (number)
- portionSizeGrams: estimated total weight in grams (number)

Be specific with the food name. Return ONLY valid JSON, no other text.`,
          },
        ],
      });
      result = response.output;
      console.log('[IDENTIFY_FOOD_API] AI Response received:', { foodName: result?.foodName });
    } catch (aiError: any) {
      const errorMessage = aiError.message || aiError.toString();
      const errorCode = aiError.code || 'UNKNOWN';
      
      console.error('[IDENTIFY_FOOD_API] Genkit/AI Error Details:', {
        message: errorMessage,
        code: errorCode,
        imageSizeInMB: (photoDataUri.length / 1024 / 1024).toFixed(2),
        fullError: JSON.stringify(aiError, null, 2).substring(0, 500),
      });

      // Check for specific error types
      if (errorMessage.includes('API key') || errorMessage.includes('authentication') || errorMessage.includes('401') || errorMessage.includes('UNAUTHENTICATED')) {
        return NextResponse.json(
          { error: 'AI service authentication failed. Please check the API key configuration.' },
          { status: 503 }
        );
      }
      if (errorMessage.includes('rate limit') || errorCode === 429) {
        return NextResponse.json(
          { error: 'Too many requests to AI service. Please wait a moment and try again.' },
          { status: 429 }
        );
      }
      if (errorMessage.includes('unsupported') || errorMessage.includes('format')) {
        return NextResponse.json(
          { error: 'Image format not supported or image is not a valid photo. Please try a different image.' },
          { status: 400 }
        );
      }

      throw aiError;
    }

    if (!result) {
      console.error('[IDENTIFY_FOOD_API] AI returned empty output');
      return NextResponse.json(
        { error: 'AI could not process the image. Please try a clearer photo of food.' },
        { status: 500 }
      );
    }

    // Validate output
    try {
      const validated = FoodResultSchema.parse(result);
      console.log('[IDENTIFY_FOOD_API] Successfully analyzed food:', { foodName: validated.foodName });
      return NextResponse.json(validated);
    } catch (validationError: any) {
      console.error('[IDENTIFY_FOOD_API] Schema validation failed:', {
        output: JSON.stringify(result).substring(0, 200),
        error: validationError.message,
      });
      return NextResponse.json(
        { error: 'AI response was invalid. Please try a different image.' },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('[IDENTIFY_FOOD_API] Unexpected error:', {
      imageSizeInMB: (photoDataUri.length / 1024 / 1024).toFixed(2),
      error: e.message,
      stack: e.stack?.substring(0, 500),
      name: e.name,
    });

    const errorMessage = e.message || 'Failed to analyze food image. Please try again.';
    const status = e.status || 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
