import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

interface DailyEntry {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface BloodPanelData {
  summary?: string;
  concerns?: string[];
  recommendations?: string[];
}

interface UserGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// Default daily goals
const DEFAULT_GOALS = {
  calories: 2000,
  protein: 50,
  carbs: 225,
  fat: 65,
};

const NutritionFeedbackSchema = z.object({
  summary: z.string(),
  alerts: z.array(z.object({
    type: z.enum(['warning', 'success', 'info']),
    message: z.string(),
  })),
  suggestions: z.array(z.string()),
  macroBalance: z.object({
    protein: z.string(),
    carbs: z.string(),
    fat: z.string(),
  }),
  bloodPanelNotes: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { dailyEntry, goals, bloodPanel } = await req.json();
    
    if (!dailyEntry) {
      return NextResponse.json({ error: 'No daily entry provided' }, { status: 400 });
    }

    const nutritionGoals = goals || DEFAULT_GOALS;
    const entry = dailyEntry as DailyEntry;
    const bloodPanelData = bloodPanel as BloodPanelData | undefined;

    // Calculate percentages and deltas
    const caloriePercent = Math.round((entry.calories / nutritionGoals.calories) * 100);
    const proteinPercent = Math.round((entry.protein / nutritionGoals.protein) * 100);
    const carbsPercent = Math.round((entry.carbs / nutritionGoals.carbs) * 100);
    const fatPercent = Math.round((entry.fat / nutritionGoals.fat) * 100);

    const proteinDelta = entry.protein - nutritionGoals.protein;
    const carbsDelta = entry.carbs - nutritionGoals.carbs;
    const fatDelta = entry.fat - nutritionGoals.fat;
    const caloriesDelta = entry.calories - nutritionGoals.calories;

    // Build blood panel context for prompt
    let bloodPanelContext = '';
    if (bloodPanelData) {
      bloodPanelContext = `\n\nBLOOD PANEL CONTEXT (from recent test):
Summary: ${bloodPanelData.summary || 'No summary available'}
Key Concerns: ${bloodPanelData.concerns?.join(', ') || 'None identified'}
Health Recommendations: ${bloodPanelData.recommendations?.join(', ') || 'None'}

When providing feedback, prioritize dietary adjustments related to these health concerns.`;
    }

    // Use Gemini to generate intelligent feedback
    const { output } = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      output: { schema: NutritionFeedbackSchema },
      prompt: `You are a nutrition expert providing brief, friendly feedback. Analyze this daily nutrition data:

Calories: ${entry.calories} / ${nutritionGoals.calories} (${caloriePercent}%)
Protein: ${entry.protein}g / ${nutritionGoals.protein}g (${proteinPercent}%) - ${proteinDelta > 0 ? `+${proteinDelta}g` : `${proteinDelta}g`}
Carbs: ${entry.carbs}g / ${nutritionGoals.carbs}g (${carbsPercent}%) - ${carbsDelta > 0 ? `+${carbsDelta}g` : `${carbsDelta}g`}
Fat: ${entry.fat}g / ${nutritionGoals.fat}g (${fatPercent}%) - ${fatDelta > 0 ? `+${fatDelta}g` : `${fatDelta}g`}
${bloodPanelContext}

Provide:
1. A brief 1-sentence summary of their nutrition status
2. 2-3 alerts (warning/success/info) about overages, deficits, or great balance
3. 2-3 specific, actionable suggestions (prioritize blood panel health concerns if available)
4. Macro balance assessment (protein/carbs/fat status as "Great", "Needs adjustment", "Overloaded", etc.)
5. If blood panel data exists, add blood panel-specific notes (e.g., cholesterol-related advice, glucose management tips)

Be encouraging but honest. Focus on what matters most: adequate protein, not overloading on calories, and managing any existing health concerns.`,
    });

    return NextResponse.json(output);
  } catch (error: any) {
    console.error('Nutrition analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze nutrition' },
      { status: 500 }
    );
  }
}
