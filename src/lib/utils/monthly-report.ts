import { FoodEntry } from '@/lib/types/food-entry';
import { UserProfile, WeightEntry } from '@/lib/types/user-profile';

export interface DailyNutrition {
  date: string; // YYYY-MM-DD
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: FoodEntry[];
}

export interface MacroStats {
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  proteinPercentage: number;
  carbsPercentage: number;
  fatPercentage: number;
}

export interface CalorieStats {
  totalConsumed: number;
  avgDaily: number;
  daysLogged: number;
  daysAboveGoal: number;
  daysWithinGoal: number;
  daysBelowGoal: number;
  netDifference: number; // actual - (goal * daysLogged)
  consistency: number; // 0-100: measure of consistency
}

export interface WeightStats {
  startingWeight: number;
  endingWeight: number;
  netChange: number;
  trend: 'losing' | 'gaining' | 'stable';
  progressTowardGoal: number; // percentage 0-100
}

export interface HealthTrend {
  category: 'positive' | 'warning';
  title: string;
  description: string;
  metric?: number;
  unit?: string;
}

export interface MonthlyReport {
  period: {
    startDate: string;
    endDate: string;
    daysInPeriod: number;
  };
  goals: {
    dailyCalorie: number;
    dailyProtein: number;
    dailyCarbs: number;
    dailyFat: number;
  };
  calorieStats: CalorieStats;
  macroStats: MacroStats;
  weightStats: WeightStats | null;
  dailyNutrition: DailyNutrition[];
  weeklyAverages: Array<{ week: number; avgCalories: number; days: string[] }>;
  trends: HealthTrend[];
  aiSummary: {
    positiveBehaviors: string[];
    areasForImprovement: string[];
    nextSteps: string[];
  };
}

/**
 * Group food entries by date
 */
export function groupEntriesByDate(entries: FoodEntry[]): Map<string, DailyNutrition> {
  const grouped = new Map<string, DailyNutrition>();

  entries.forEach((entry) => {
    // Convert Firestore timestamp to date string
    const date = entry.createdAt.toDate?.() || new Date(entry.createdAt as any);
    const dateStr = date.toISOString().split('T')[0];

    if (!grouped.has(dateStr)) {
      grouped.set(dateStr, {
        date: dateStr,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        entries: [],
      });
    }

    const day = grouped.get(dateStr)!;
    day.calories += entry.calories;
    day.protein += entry.proteinGrams;
    day.carbs += entry.carbsGrams;
    day.fat += entry.fatGrams;
    day.entries.push(entry);
  });

  return grouped;
}

/**
 * Calculate calorie statistics for the period
 */
export function calculateCalorieStats(
  dailyData: Map<string, DailyNutrition>,
  dailyGoal: number
): CalorieStats {
  const days = Array.from(dailyData.values());
  const totalConsumed = days.reduce((sum, day) => sum + day.calories, 0);
  const daysLogged = days.length;

  let daysAboveGoal = 0;
  let daysWithinGoal = 0;
  let daysBelowGoal = 0;
  let calorieVariance = 0;

  const avgDaily = daysLogged > 0 ? totalConsumed / daysLogged : 0;

  days.forEach((day) => {
    if (day.calories > dailyGoal * 1.05) {
      daysAboveGoal++;
    } else if (day.calories < dailyGoal * 0.95) {
      daysBelowGoal++;
    } else {
      daysWithinGoal++;
    }
    calorieVariance += Math.abs(day.calories - avgDaily);
  });

  // Consistency: 100 = perfect, lower = more variation
  const avgVariance = daysLogged > 0 ? calorieVariance / daysLogged : 0;
  const consistency = Math.max(0, 100 - (avgVariance / avgDaily) * 100);

  return {
    totalConsumed,
    avgDaily: Math.round(avgDaily),
    daysLogged,
    daysAboveGoal,
    daysWithinGoal,
    daysBelowGoal,
    netDifference: totalConsumed - dailyGoal * daysLogged,
    consistency: Math.round(consistency * 10) / 10,
  };
}

/**
 * Calculate macro statistics
 */
export function calculateMacroStats(
  dailyData: Map<string, DailyNutrition>,
  dailyMacroGoals?: {
    protein: number;
    carbs: number;
    fat: number;
  }
): MacroStats {
  const days = Array.from(dailyData.values());
  const daysLogged = days.length;

  const totalProtein = days.reduce((sum, day) => sum + day.protein, 0);
  const totalCarbs = days.reduce((sum, day) => sum + day.carbs, 0);
  const totalFat = days.reduce((sum, day) => sum + day.fat, 0);

  const avgProtein = daysLogged > 0 ? Math.round(totalProtein / daysLogged * 10) / 10 : 0;
  const avgCarbs = daysLogged > 0 ? Math.round(totalCarbs / daysLogged * 10) / 10 : 0;
  const avgFat = daysLogged > 0 ? Math.round(totalFat / daysLogged * 10) / 10 : 0;

  // Calculate percentages based on calories (4 cal/g for protein and carbs, 9 cal/g for fat)
  const macroCalories = avgProtein * 4 + avgCarbs * 4 + avgFat * 9;
  const proteinPercentage = macroCalories > 0 ? Math.round((avgProtein * 4) / macroCalories * 100) : 0;
  const carbsPercentage = macroCalories > 0 ? Math.round((avgCarbs * 4) / macroCalories * 100) : 0;
  const fatPercentage = macroCalories > 0 ? Math.round((avgFat * 9) / macroCalories * 100) : 0;

  return {
    avgProtein,
    avgCarbs,
    avgFat,
    proteinPercentage,
    carbsPercentage,
    fatPercentage,
  };
}

/**
 * Calculate weight statistics
 */
export function calculateWeightStats(
  weightHistory: WeightEntry[] | undefined,
  goalWeightLbs: number
): WeightStats | null {
  if (!weightHistory || weightHistory.length < 2) {
    return null;
  }

  // Sort by date
  const sorted = [...weightHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const startingWeight = sorted[0].weightLbs;
  const endingWeight = sorted[sorted.length - 1].weightLbs;
  const netChange = Math.round((endingWeight - startingWeight) * 10) / 10;

  let trend: 'losing' | 'gaining' | 'stable' = 'stable';
  if (netChange < -1) trend = 'losing';
  else if (netChange > 1) trend = 'gaining';

  // Calculate progress toward goal
  const totalGoalChange = Math.abs(goalWeightLbs - startingWeight);
  const actualChange = Math.abs(endingWeight - startingWeight);
  const progressTowardGoal = totalGoalChange > 0 ? Math.min(100, (actualChange / totalGoalChange) * 100) : 0;

  return {
    startingWeight,
    endingWeight,
    netChange,
    trend,
    progressTowardGoal: Math.round(progressTowardGoal),
  };
}

/**
 * Calculate weekly averages
 */
export function calculateWeeklyAverages(
  dailyData: Map<string, DailyNutrition>,
  startDate: string
): Array<{ week: number; avgCalories: number; days: string[] }> {
  const sorted = Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) return [];

  const start = new Date(startDate);
  const weeks: Array<{ week: number; avgCalories: number; days: string[] }> = [];

  let currentWeek = 1;
  let currentWeekDays: DailyNutrition[] = [];

  sorted.forEach((day) => {
    const dayDate = new Date(day.date);
    const dayOfWeek = dayDate.getDay();

    if (dayOfWeek === 0 && currentWeekDays.length > 0) {
      // End of week
      const avgCalories = Math.round(currentWeekDays.reduce((sum, d) => sum + d.calories, 0) / currentWeekDays.length);
      weeks.push({
        week: currentWeek,
        avgCalories,
        days: currentWeekDays.map((d) => d.date),
      });
      currentWeek++;
      currentWeekDays = [];
    }

    currentWeekDays.push(day);
  });

  if (currentWeekDays.length > 0) {
    const avgCalories = Math.round(currentWeekDays.reduce((sum, d) => sum + d.calories, 0) / currentWeekDays.length);
    weeks.push({
      week: currentWeek,
      avgCalories,
      days: currentWeekDays.map((d) => d.date),
    });
  }

  return weeks;
}

/**
 * Detect health trends from the data
 */
export function detectHealthTrends(
  dailyData: Map<string, DailyNutrition>,
  calorieStats: CalorieStats,
  macroStats: MacroStats,
  weightStats: WeightStats | null,
  dailyGoal: number,
  dailyMacroGoals?: {
    protein: number;
    carbs: number;
    fat: number;
  }
): HealthTrend[] {
  const trends: HealthTrend[] = [];
  const days = Array.from(dailyData.values());

  // Positive: Consistent calorie control
  if (calorieStats.consistency > 70) {
    trends.push({
      category: 'positive',
      title: 'Consistent Calorie Control',
      description: `Your calorie intake is very consistent with ${Math.round(calorieStats.consistency)}% consistency. This stability supports sustainable progress.`,
      metric: Math.round(calorieStats.consistency),
      unit: '%',
    });
  }

  // Positive: Calorie deficit
  if (calorieStats.netDifference < -500) {
    const avgDeficit = Math.round(Math.abs(calorieStats.netDifference) / calorieStats.daysLogged);
    trends.push({
      category: 'positive',
      title: 'Maintaining Calorie Deficit',
      description: `You averaged a ${avgDeficit} calorie deficit per day, which supports sustainable weight loss.`,
      metric: avgDeficit,
      unit: 'cal/day',
    });
  }

  // Positive: High protein intake
  if (dailyMacroGoals && macroStats.avgProtein >= dailyMacroGoals.protein * 0.95) {
    const percentageIncrease = dailyMacroGoals.protein > 0 
      ? Math.round(((macroStats.avgProtein - dailyMacroGoals.protein) / dailyMacroGoals.protein) * 100)
      : 0;
    trends.push({
      category: 'positive',
      title: 'Strong Protein Intake',
      description: `You're meeting your protein goals with an average of ${Math.round(macroStats.avgProtein)}g daily. This supports muscle maintenance.`,
      metric: Math.round(macroStats.avgProtein),
      unit: 'g/day',
    });
  }

  // Positive: Weight loss progress
  if (weightStats && weightStats.trend === 'losing') {
    trends.push({
      category: 'positive',
      title: 'Positive Weight Trend',
      description: `You've lost ${Math.abs(weightStats.netChange)} lbs this month with a ${weightStats.trend} trend.`,
      metric: Math.abs(weightStats.netChange),
      unit: 'lbs',
    });
  }

  // Positive: Regular meal logging
  if (calorieStats.daysLogged >= 25) {
    trends.push({
      category: 'positive',
      title: 'Excellent Logging Consistency',
      description: `You logged meals on ${calorieStats.daysLogged} days this month, showing strong commitment to tracking.`,
      metric: calorieStats.daysLogged,
      unit: 'days',
    });
  }

  // Warning: Frequent calorie spikes
  if (calorieStats.daysAboveGoal >= 10) {
    trends.push({
      category: 'warning',
      title: 'Frequent Calorie Spikes',
      description: `Your calorie intake exceeded your goal on ${calorieStats.daysAboveGoal} days. Consider identifying triggers and strategies to stay within goal.`,
      metric: calorieStats.daysAboveGoal,
      unit: 'days',
    });
  }

  // Warning: Low protein intake
  if (dailyMacroGoals && macroStats.avgProtein < dailyMacroGoals.protein * 0.8) {
    const deficit = Math.round(dailyMacroGoals.protein - macroStats.avgProtein);
    trends.push({
      category: 'warning',
      title: 'Below Protein Goal',
      description: `Your average protein intake (${Math.round(macroStats.avgProtein)}g) is below your goal. Increasing protein can help preserve muscle during weight management.`,
      metric: deficit,
      unit: 'g/day needed',
    });
  }

  // Warning: Very low calorie days
  const lowCalorieDays = days.filter((d) => d.calories < dailyGoal * 0.7).length;
  if (lowCalorieDays >= 3) {
    trends.push({
      category: 'warning',
      title: 'Very Low Calorie Intake Days',
      description: `You had ${lowCalorieDays} days with very low calorie intake (under 70% of goal). Very restrictive patterns can be unsustainable.`,
      metric: lowCalorieDays,
      unit: 'days',
    });
  }

  // Warning: Inconsistent logging
  if (calorieStats.daysLogged < 20) {
    trends.push({
      category: 'warning',
      title: 'Inconsistent Meal Logging',
      description: `You logged meals on only ${calorieStats.daysLogged} days. More consistent tracking will give clearer progress insights.`,
      metric: 30 - calorieStats.daysLogged,
      unit: 'days missed',
    });
  }

  // Warning: Weight gain
  if (weightStats && weightStats.trend === 'gaining') {
    trends.push({
      category: 'warning',
      title: 'Weight Gain Trend',
      description: `You gained ${Math.abs(weightStats.netChange)} lbs this month. This may signal calorie surplus or changes in water retention.`,
      metric: Math.abs(weightStats.netChange),
      unit: 'lbs',
    });
  }

  return trends;
}
