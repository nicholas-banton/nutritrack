'use client';

import { DailyNutrition } from '@/lib/utils/monthly-report';

interface DailyCalorieChartProps {
  dailyData: DailyNutrition[];
  dailyGoal: number;
}

export function DailyCalorieChart({ dailyData, dailyGoal }: DailyCalorieChartProps) {
  if (dailyData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  // Calculate max value for scaling
  const maxCalorie = Math.max(...dailyData.map((d) => d.calories), dailyGoal * 1.2);
  const height = 200;
  const barWidth = Math.max(2, Math.floor(400 / dailyData.length));
  const spacing = Math.max(1, Math.floor((400 - dailyData.length * barWidth) / (dailyData.length - 1)));

  return (
    <div className="space-y-4">
      <div className="relative h-64 border border-border rounded-lg p-4 bg-card">
        <svg viewBox="0 0 500 250" className="w-full h-full">
          {/* Y-axis labels */}
          <text x="5" y="15" className="text-xs fill-muted-foreground" fontSize="12">
            {Math.round(maxCalorie)}
          </text>
          <text x="5" y="130" className="text-xs fill-muted-foreground" fontSize="12">
            {Math.round(maxCalorie / 2)}
          </text>
          <text x="5" y="240" className="text-xs fill-muted-foreground" fontSize="12">
            0
          </text>

          {/* Goal line */}
          <line
            x1="40"
            y1={220 - (dailyGoal / maxCalorie) * 200}
            x2="480"
            y2={220 - (dailyGoal / maxCalorie) * 200}
            stroke="#8B5CF6"
            strokeDasharray="5,5"
            strokeWidth="2"
            opacity="0.5"
          />
          <text x="300" y={215 - (dailyGoal / maxCalorie) * 200} className="text-xs fill-muted-foreground" fontSize="10">
            Goal: {dailyGoal}
          </text>

          {/* Bars */}
          {dailyData.map((day, idx) => {
            const barHeight = (day.calories / maxCalorie) * 200;
            const x = 40 + idx * (barWidth + spacing);
            const y = 220 - barHeight;
            const isAboveGoal = day.calories > dailyGoal * 1.05;
            const isBelowGoal = day.calories < dailyGoal * 0.95;

            let color = '#22C55E'; // green for within goal
            if (isAboveGoal) color = '#F87171'; // red for above
            if (isBelowGoal) color = '#3B82F6'; // blue for below

            return (
              <g key={`${day.date}-bar`}>
                <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} opacity="0.8" rx="2" />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex gap-4 justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className="text-muted-foreground">Within Goal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span className="text-muted-foreground">Above Goal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span className="text-muted-foreground">Below Goal</span>
        </div>
      </div>
    </div>
  );
}

interface MacroDistributionChartProps {
  proteinPercentage: number;
  carbsPercentage: number;
  fatPercentage: number;
}

export function MacroDistributionChart({
  proteinPercentage,
  carbsPercentage,
  fatPercentage,
}: MacroDistributionChartProps) {
  const total = proteinPercentage + carbsPercentage + fatPercentage || 100;
  const proteinAngle = (proteinPercentage / total) * 360;
  const carbsAngle = (carbsPercentage / total) * 360;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-48 h-48">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Pie slices */}
          <circle cx="50" cy="50" r="40" fill="none" stroke="#A78BFA" strokeWidth="30" strokeDasharray={`${proteinAngle} ${360 - proteinAngle}`} strokeDashoffset="0" transform="rotate(-90 50 50)" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#22D3EE" strokeWidth="30" strokeDasharray={`${carbsAngle} ${360 - carbsAngle}`} strokeDashoffset={`${-proteinAngle}`} transform="rotate(-90 50 50)" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#FB923C" strokeWidth="30" />

          {/* Center circle for donut effect */}
          <circle cx="50" cy="50" r="20" fill="currentColor" />
        </svg>
      </div>

      <div className="space-y-2 w-full">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-400 rounded-full"></div>
            <span className="text-muted-foreground">Protein</span>
          </div>
          <span className="font-semibold">{Math.round(proteinPercentage)}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-cyan-400 rounded-full"></div>
            <span className="text-muted-foreground">Carbs</span>
          </div>
          <span className="font-semibold">{Math.round(carbsPercentage)}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-400 rounded-full"></div>
            <span className="text-muted-foreground">Fat</span>
          </div>
          <span className="font-semibold">{Math.round(fatPercentage)}%</span>
        </div>
      </div>
    </div>
  );
}

interface WeightTrendChartProps {
  startingWeight: number;
  endingWeight: number;
  trend: 'losing' | 'gaining' | 'stable';
}

export function WeightTrendChart({ startingWeight, endingWeight, trend }: WeightTrendChartProps) {
  const change = endingWeight - startingWeight;
  const percentChange = ((change / startingWeight) * 100).toFixed(1);

  const trendColor = trend === 'losing' ? 'text-green-500' : trend === 'gaining' ? 'text-red-500' : 'text-blue-500';
  const trendIcon = trend === 'losing' ? '↓' : trend === 'gaining' ? '↑' : '→';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 border border-border rounded-lg bg-card">
          <div className="text-xs text-muted-foreground mb-1">Starting</div>
          <div className="text-2xl font-bold">{startingWeight.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">lbs</div>
        </div>

        <div className=" flex flex-col items-center justify-center p-4 border border-border rounded-lg bg-card">
          <div className={`text-3xl font-bold ${trendColor} mb-1`}>{trendIcon}</div>
          <div className={`text-lg font-semibold ${trendColor}`}>{Math.abs(change).toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">{change > 0 ? '+' : ''}{percentChange}%</div>
        </div>

        <div className="text-center p-4 border border-border rounded-lg bg-card">
          <div className="text-xs text-muted-foreground mb-1">Current</div>
          <div className="text-2xl font-bold">{endingWeight.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">lbs</div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground text-center">
        {trend === 'losing' && 'Great progress toward your goals!'}
        {trend === 'gaining' && 'Consider reviewing your nutrition strategy'}
        {trend === 'stable' && 'Your weight is stable this month'}
      </div>
    </div>
  );
}

interface WeeklyAverageChartProps {
  weeklyAverages: Array<{ week: number; avgCalories: number }>;
  dailyGoal: number;
}

export function WeeklyAverageChart({ weeklyAverages, dailyGoal }: WeeklyAverageChartProps) {
  if (weeklyAverages.length === 0) {
    return <div className="text-muted-foreground text-sm text-center py-8">No weekly data available</div>;
  }

  const maxCalorie = Math.max(...weeklyAverages.map((w) => w.avgCalories), dailyGoal * 1.2);
  const barWidth = 40;
  const spacing = 20;

  return (
    <div className="space-y-4">
      <div className="relative h-48 border border-border rounded-lg p-4 bg-card">
        <svg viewBox="0 0 400 200" className="w-full h-full">
          {/* Y-axis labels */}
          <text x="5" y="15" className="text-xs fill-muted-foreground" fontSize="12">
            {Math.round(maxCalorie)}
          </text>
          <text x="5" y="110" className="text-xs fill-muted-foreground" fontSize="12">
            {Math.round(maxCalorie / 2)}
          </text>
          <text x="5" y="195" className="text-xs fill-muted-foreground" fontSize="12">
            0
          </text>

          {/* Goal line */}
          <line
            x1="30"
            y1={180 - (dailyGoal / maxCalorie) * 160}
            x2="380"
            y2={180 - (dailyGoal / maxCalorie) * 160}
            stroke="#8B5CF6"
            strokeDasharray="5,5"
            strokeWidth="1.5"
            opacity="0.5"
          />

          {/* Bars */}
          {weeklyAverages.map((week, idx) => {
            const barHeight = (week.avgCalories / maxCalorie) * 160;
            const x = 30 + idx * (barWidth + spacing);
            const y = 180 - barHeight;

            let color = '#22C55E';
            if (week.avgCalories > dailyGoal * 1.05) color = '#F87171';
            if (week.avgCalories < dailyGoal * 0.95) color = '#3B82F6';

            return (
              <g key={`week-${week.week}`}>
                <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} opacity="0.8" rx="2" />
                <text x={x + barWidth / 2} y="195" className="text-xs fill-muted-foreground" fontSize="10" textAnchor="middle">
                  W{week.week}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="text-xs text-muted-foreground text-center">
        Weekly average calorie intake compared to daily goal
      </div>
    </div>
  );
}
