import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const BloodPanelSchema = z.object({
  extractedValues: z.record(z.union([z.number(), z.string()])),
  summary: z.string(),
  concerns: z.array(z.string()),
  recommendations: z.array(z.string()),
});

/**
 * Detect actual image format from file magic bytes
 * Returns: 'jpeg' | 'png' | 'heic' | 'unknown'
 */
function detectImageFormat(buffer: Uint8Array): string {
  // Check magic bytes (file signatures)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  // HEIC/HEIF: ftyp at offset 4
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'mif1') {
      return 'heic';
    }
  }
  return 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to base64 for Gemini Vision
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    const base64 = Buffer.from(uint8Array).toString('base64');

    // Detect actual format from magic bytes
    const detectedFormat = detectImageFormat(uint8Array);
    
    // Use provided MIME type as fallback
    let mimeType = file.type || 'image/jpeg';

    console.log('[BLOOD-PANEL] File upload details:', {
      originalMimeType: file.type,
      detectedFormat,
      fileName: file.name,
      fileSize: file.size,
      bufferSize: uint8Array.length,
    });

    // If we detected HEIC, it means it wasn't converted on client - reject it
    if (detectedFormat === 'heic') {
      return NextResponse.json(
        { error: 'HEIC format not supported. Image may not have been converted on your device. Please try uploading a JPG or PNG file.' },
        { status: 400 }
      );
    }

    // For Android and edge cases where detection fails but file appears to be an image
    // Try the provided MIME type first, then fallback to JPEG if it looks like one
    let normalizedFormat = 'jpeg'; // Default fallback
    
    if (detectedFormat === 'png' || mimeType.includes('png')) {
      normalizedFormat = 'png';
    } else if (detectedFormat === 'jpeg' || mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      normalizedFormat = 'jpeg';
    } else if (detectedFormat === 'unknown') {
      // Unknown format - assume JPEG and let Gemini handle it
      const extension = file.name.toLowerCase().split('.').pop();
      if (extension === 'png') {
        normalizedFormat = 'png';
      } else {
        // Default to JPEG for unknown formats
        normalizedFormat = 'jpeg';
      }
      console.warn('[BLOOD-PANEL] Unknown format detected, attempting with:', normalizedFormat);
    }

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
                format: normalizedFormat as any,
                data: base64,
              },
            },
          ],
        },
      ],
    });

    return NextResponse.json(output);
  } catch (error: any) {
    console.error('Blood panel analysis error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      fullError: error,
    });
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Failed to analyze blood panel';
    
    if (error.message?.includes('INVALID_ARGUMENT')) {
      errorMessage = 'Image format invalid. The file may be corrupted. Please try a different image.';
    } else if (error.message?.includes('UNPROCESSABLE_ENTITY')) {
      errorMessage = 'Image could not be read. Please ensure it is a clear, valid JPG or PNG file.';
    } else if (error.message?.includes('PERMISSION_DENIED') || error.message?.includes('UNAUTHENTICATED')) {
      errorMessage = 'Authentication error. Please try again.';
    } else if (error.message?.includes('400') || error.message?.includes('bad')) {
      errorMessage = 'Image could not be processed. Please ensure it is clear, readable, and in JPG or PNG format.';
    } else if (error.code === 'ERR_INVALID_ARG_TYPE') {
      errorMessage = 'Image data is invalid. This might be a file format issue on your device.';
    }
    
    console.error('[BLOOD-PANEL] Returning error to client:', errorMessage);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
