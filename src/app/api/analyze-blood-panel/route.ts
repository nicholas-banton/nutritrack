import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const BloodPanelSchema = z.object({
  extractedValues: z.record(z.union([z.number(), z.string()])),
  summary: z.string(),
  concerns: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to base64 for Gemini Vision
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Determine file type/mime
    const mimeType = file.type || 'image/jpeg';

    // Use Gemini Vision to extract text from blood panel image
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      output: { schema: BloodPanelSchema },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are a medical data extraction specialist. Analyze this blood panel test result image and extract ALL numeric values and their corresponding test names/labels.

Please provide:
1. extractedValues: Object with test names as keys and values as numbers or strings (e.g., {"Total Cholesterol": 210, "HDL": 45, "LDL": 150, "Triglycerides": 120, "Glucose": 95, "WBC": 7.2, "RBC": 4.8, "Hemoglobin": 14.5, "Hematocrit": 42})
2. summary: 1-2 sentence summary of overall blood panel status
3. concerns: Array of 2-3 health concerns based on values (if any abnormalities)
4. recommendations: Array of 2-3 dietary/lifestyle recommendations based on the blood panel

Be thorough in extracting ALL visible test results and values.`,
            },
            {
              type: 'image',
              image: {
                format: mimeType === 'application/pdf' ? 'jpeg' : (mimeType.split('/')[1] as any),
                data: base64,
              },
            },
          ],
        },
      ],
    });

    return NextResponse.json(output);
  } catch (error: any) {
    console.error('Blood panel analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze blood panel' },
      { status: 500 }
    );
  }
}
