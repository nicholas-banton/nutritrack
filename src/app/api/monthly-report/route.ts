import { NextRequest, NextResponse } from 'next/server';
import { ai, geminiModel } from '@/ai/genkit';
import { z } from 'genkit';
import {
  CalorieStats,
  MacroStats,
  WeightStats,
  HealthTrend,
  MonthlyReport,
} from '@/lib/utils/monthly-report';

const AIInsightsSchema = z.object({
  positiveBehaviors: z.array(z.string()).describe('2-3 positive behaviors or achievements'),
  areasForImprovement: z.array(z.string()).describe('1-2 areas that could be improved'),
  nextSteps: z.array(z.string()).describe('2-3 specific actionable next steps'),
});

/**
 * POST /api/monthly-report
 * Generates AI insights for the monthly health progress report
 * The client sends the calculated stats, and this endpoint generates AI insights
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const {
      calorieStats,
      macroStats,
      weightStats,
      trends,
      dailyGoal,
      dailyMacroGoals,
    } = body as {
      calorieStats: CalorieStats;
      macroStats: MacroStats;
      weightStats: WeightStats | null;
      trends: HealthTrend[];
      dailyGoal: number;
      dailyMacroGoals: { protein: number; carbs: number; fat: number };
    };

    // Generate AI insights
    let aiSummary = {
      positiveBehaviors: ['Keep tracking consistently'],
      areasForImprovement: ['Set more specific goals'],
      nextSteps: ['Review your progress weekly'],
    };

    try {
      const trendsText = trends.map((t) => `${t.category.toUpperCase()}: ${t.title} - ${t.description}`).join('\n');

      const aiResponse = await ai.generate({
        model: geminiModel,
        output: { schema: AIInsightsSchema },
        prompt: `You are a professional nutrition coach analyzing a user's monthly nutrition data.

User's Monthly Statistics:
- Average daily calorie intake: ${calorieStats.avgDaily} kcal (Goal: ${dailyGoal} kcal)
- Days logged: ${calorieStats.daysLogged} out of 30
- Net calorie difference: ${calorieStats.netDifference > 0 ? '+' : ''}${calorieStats.netDifference} kcal
- Consistency score: ${calorieStats.consistency}%
- Average protein: ${macroStats.avgProtein}g (Goal: ${dailyMacroGoals.protein}g)
- Average carbs: ${macroStats.avgCarbs}g (Goal: ${dailyMacroGoals.carbs}g)
- Average fat: ${macroStats.avgFat}g (Goal: ${dailyMacroGoals.fat}g)
- Macro breakdown: ${macroStats.proteinPercentage}% protein, ${macroStats.carbsPercentage}% carbs, ${macroStats.fatPercentage}% fat
${weightStats ? `- Weight change: ${weightStats.netChange > 0 ? '+' : ''}${weightStats.netChange} lbs (Trend: ${weightStats.trend})` : '- No weight data logged'}

Detected Trends:
${trendsText}

Provide personalized, encouraging feedback that:
1. Acknowledges 2-3 positive behaviors or achievements (be specific to their data)
2. Identifies 1-2 specific areas for improvement
3. Suggests 2-3 concrete, actionable next steps

Use natural language and be supportive. Return ONLY valid JSON.`,
      });

      if (aiResponse.output) {
        aiSummary = aiResponse.output;
      }
    } catch (aiError) {
      console.error('Error generating AI insights:', aiError);
      // Use default summary if AI fails
    }

    return NextResponse.json(aiSummary);
  } catch (error) {
    console.error('Error processing report request:', error);
    return NextResponse.json(
      { error: 'Failed to generate insights', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
