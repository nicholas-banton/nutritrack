export interface UserProfile {
  name: string;
  age: number;
  sex: 'male' | 'female' | 'other';
  heightInches: number; // Changed from heightCm to imperial (inches)
  currentWeightLbs: number; // Changed from currentWeightKg to imperial (pounds)
  goalWeightLbs: number; // Changed from goalWeightKg to imperial (pounds)
  goalWeightDate?: string; // ISO date string (YYYY-MM-DD)
  
  // Calculated fields
  bmi?: number;
  goalBmi?: number;
  daysToGoal?: number;
  weeklyWeightChange?: number; // lbs per week needed
  dailyCalorieAdjustment?: number; // calories to add/subtract from maintenance
  
  // Macro goals (calculated from personal details)
  dailyCalorieGoal?: number;
  dailyProteinGoal?: number;
  dailyCarbsGoal?: number;
  dailyFatGoal?: number;
  
  // Blood panel data
  bloodPanel?: {
    uploadDate: string;
    rawText: string;
    extractedValues: {
      [key: string]: number | string;
    };
  };
  
  // Metadata
  createdAt?: any;
  updatedAt?: any;
  profileId?: string; // Unique ID for this profile when user has multiple profiles
}

export function calculateBMI(heightInches: number, weightLbs: number): number {
  if (heightInches <= 0 || weightLbs <= 0) return 0;
  // BMI = (weight in pounds / (height in inches)^2) × 703
  return Math.round((weightLbs / (heightInches * heightInches)) * 703 * 10) / 10;
}

export function calculateMacroGoals(
  age: number,
  sex: string,
  heightInches: number,
  currentWeightLbs: number,
  goalWeightLbs: number,
  goalWeightDate?: string
) {
  // Convert to metric for BMR calculation, then back to imperial for macros
  const heightCm = heightInches * 2.54;
  const weight = goalWeightLbs / 2.20462; // Convert to kg for calculation
  
  // Estimated maintenance calories at goal weight (using Mifflin-St Jeor equation + 1.5x activity multiplier)
  let bmr = 0;
  if (sex === 'male') {
    bmr = 10 * weight + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * heightCm - 5 * age - 161;
  }
  
  const maintenanceCalories = Math.round(bmr * 1.5); // Moderate activity
  
  // Calculate weight change strategy if goal date is provided
  let dailyCalorieGoal = maintenanceCalories;
  let dailyCalorieAdjustment = 0;
  let daysToGoal = 0;
  let weeklyWeightChange = 0;
  
  if (goalWeightDate) {
    const today = new Date();
    const goalDate = new Date(goalWeightDate);
    daysToGoal = Math.max(0, Math.floor((goalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    
    const weightDifference = goalWeightLbs - currentWeightLbs; // In pounds
    
    if (daysToGoal > 0 && Math.abs(weightDifference) > 0.1) {
      const weeksToGoal = daysToGoal / 7;
      weeklyWeightChange = weightDifference / weeksToGoal;
      
      // Calculate daily calorie adjustment needed
      // 1 lb of body fat ≈ 3,500 calories
      // weightChange (lbs/week) * 3500 cal/lb ÷ 7 days = daily adjustment
      dailyCalorieAdjustment = Math.round((weeklyWeightChange * 3500) / 7);
      
      // Clamp adjustment to healthy range: -1000 to +500 cal/day
      dailyCalorieAdjustment = Math.max(-1000, Math.min(500, dailyCalorieAdjustment));
      
      dailyCalorieGoal = Math.max(1200, maintenanceCalories + dailyCalorieAdjustment);
    }
  }
  
  // Macro distribution (flexible but science-backed)
  // Using 2.2g protein per kg as reference (converts to ~1g per lb)
  const dailyProteinGoal = Math.round(currentWeightLbs * 1.0); // 1g per lb of current weight
  const dailyFatGoal = Math.round((dailyCalorieGoal * 0.28) / 9); // 28% of calories / 9 cal per gram
  const dailyCarbsGoal = Math.round((dailyCalorieGoal - dailyProteinGoal * 4 - dailyFatGoal * 9) / 4);
  
  return {
    dailyCalorieGoal,
    dailyProteinGoal,
    dailyCarbsGoal,
    dailyFatGoal,
    daysToGoal,
    weeklyWeightChange: Math.round(weeklyWeightChange * 100) / 100,
    dailyCalorieAdjustment,
  };
}
