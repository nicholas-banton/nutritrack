'use client';

import React from 'react';
import { MonthlyReport } from '@/lib/utils/monthly-report';
import {
  DailyCalorieChart,
  MacroDistributionChart,
  WeightTrendChart,
  WeeklyAverageChart,
} from './charts';
import { AlertCircle, TrendingDown, TrendingUp, CheckCircle2 } from 'lucide-react';

interface MonthlyReportDashboardProps {
  report: MonthlyReport;
  isLoading?: boolean;
}

export function MonthlyReportDashboard({ report, isLoading }: MonthlyReportDashboardProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Generating your report...</p>
        </div>
      </div>
    );
  }

  const {
    period,
    goals,
    calorieStats,
    macroStats,
    weightStats,
    dailyNutrition,
    weeklyAverages,
    trends,
    aiSummary,
  } = report;

  const netDeficit = calorieStats.netDifference < 0;
  const calorieStatus = netDeficit
    ? `deficit of ${Math.abs(calorieStats.netDifference).toLocaleString()} cal`
    : `surplus of ${calorieStats.netDifference.toLocaleString()} cal`;

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold mb-2">Monthly Health Progress Report</h1>
        <p className="text-muted-foreground">
          {period.startDate} to {period.endDate}
        </p>
      </div>

      {/* Summary Cards */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Calorie Card */}
          <div className="p-4 border border-border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground mb-1">Avg Daily Calories</div>
            <div className="text-3xl font-bold mb-2">{calorieStats.avgDaily}</div>
            <div className="text-xs text-muted-foreground">Net {calorieStatus}</div>
          </div>

          {/* Days Logged */}
          <div className="p-4 border border-border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground mb-1">Days Logged</div>
            <div className="text-3xl font-bold mb-2">{calorieStats.daysLogged}</div>
            <div className="text-xs text-muted-foreground">out of {period.daysInPeriod} days</div>
          </div>

          {/* Consistency */}
          <div className="p-4 border border-border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground mb-1">Consistency</div>
            <div className="text-3xl font-bold mb-2">{Math.round(calorieStats.consistency)}%</div>
            <div className="text-xs text-muted-foreground">
              {calorieStats.consistency > 80 ? 'Excellent' : calorieStats.consistency > 60 ? 'Good' : 'Needs work'}
            </div>
          </div>

          {/* Weight Change (if available) */}
          <div className="p-4 border border-border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground mb-1">Weight Change</div>
            <div className="text-3xl font-bold mb-2">
              {weightStats ? (
                <>
                  {weightStats.netChange > 0 ? '+' : ''}
                  {weightStats.netChange.toFixed(1)} lbs
                </>
              ) : (
                '—'
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {weightStats ? (
                weightStats.trend === 'losing' ? 'Losing' : weightStats.trend === 'gaining' ? 'Gaining' : 'Stable'
              ) : (
                'No data'
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Calorie Progress */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Calorie Progress</h2>
          <p className="text-sm text-muted-foreground">
            You consumed {calorieStats.totalConsumed.toLocaleString()} calories over {calorieStats.daysLogged} days.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <DailyCalorieChart dailyData={dailyNutrition} dailyGoal={goals.dailyCalorie} />
          </div>

        <div className="p-4 border border-border rounded-lg bg-card">
            <div className="text-xs text-muted-foreground mb-2 uppercase font-semibold">Breakdown</div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">Within Goal</span>
                  <span className="font-semibold text-green-500">{calorieStats.daysWithinGoal} days</span>
                </div>
                <div className="w-full bg-border rounded h-2">
                  <div
                    className="bg-green-500 h-2 rounded"
                    style={{ width: `${calorieStats.daysLogged > 0 ? (calorieStats.daysWithinGoal / calorieStats.daysLogged) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">Above Goal</span>
                  <span className="font-semibold text-red-500">{calorieStats.daysAboveGoal} days</span>
                </div>
                <div className="w-full bg-border rounded h-2">
                  <div
                    className="bg-red-500 h-2 rounded"
                    style={{ width: `${calorieStats.daysLogged > 0 ? (calorieStats.daysAboveGoal / calorieStats.daysLogged) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm">Below Goal</span>
                  <span className="font-semibold text-blue-500">{calorieStats.daysBelowGoal} days</span>
                </div>
                <div className="w-full bg-border rounded h-2">
                  <div
                    className="bg-blue-500 h-2 rounded"
                    style={{ width: `${calorieStats.daysLogged > 0 ? (calorieStats.daysBelowGoal / calorieStats.daysLogged) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Macronutrient Breakdown */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Macronutrient Breakdown</h2>
          <p className="text-sm text-muted-foreground">
            Average daily intake: {macroStats.avgProtein.toFixed(1)}g protein, {macroStats.avgCarbs.toFixed(1)}g carbs,{' '}
            {macroStats.avgFat.toFixed(1)}g fat
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="p-6 border border-border rounded-lg bg-card">
            <MacroDistributionChart
              proteinPercentage={macroStats.proteinPercentage}
              carbsPercentage={macroStats.carbsPercentage}
              fatPercentage={macroStats.fatPercentage}
              proteinGrams={macroStats.avgProtein}
              carbsGrams={macroStats.avgCarbs}
              fatGrams={macroStats.avgFat}
            />
          </div>
        </div>
      </section>

      {/* Weight Progress */}
      {weightStats && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Weight Progress</h2>
            <p className="text-sm text-muted-foreground">
              {weightStats.netChange > 0
                ? `You gained ${Math.abs(weightStats.netChange)} lbs this month.`
                : weightStats.netChange < 0
                  ? `You lost ${Math.abs(weightStats.netChange)} lbs this month.`
                  : 'Your weight remained stable.'}
            </p>
          </div>

          <div className="p-6 border border-border rounded-lg bg-card">
            <WeightTrendChart
              startingWeight={weightStats.startingWeight}
              endingWeight={weightStats.endingWeight}
              trend={weightStats.trend}
            />
          </div>
        </section>
      )}

      {/* Weekly Averages */}
      {weeklyAverages.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">Weekly Calorie Averages</h2>
            <p className="text-sm text-muted-foreground">
              How your weekly averages compared to your daily goal
            </p>
          </div>

          <div className="p-6 border border-border rounded-lg bg-card">
            <WeeklyAverageChart weeklyAverages={weeklyAverages} dailyGoal={goals.dailyCalorie} />
          </div>
        </section>
      )}

      {/* Health Trends */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold mb-4">Health Trends</h2>

        {trends.length === 0 ? (
          <div className="p-6 border border-border rounded-lg bg-card text-center text-muted-foreground">
            No significant trends detected. Keep logging consistently!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trends.map((trend, idx) => (
              <div
                key={idx}
                className={`p-4 border rounded-lg ${
                  trend.category === 'positive'
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-orange-500/30 bg-orange-500/5'
                }`}
              >
                <div className="flex gap-3">
                  {trend.category === 'positive' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-sm mb-1">{trend.title}</div>
                    <p className="text-sm text-muted-foreground">{trend.description}</p>
                    {trend.metric !== undefined && (
                      <div className="text-xs text-muted-foreground mt-2">
                        {trend.metric} {trend.unit}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI Insights */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold mb-4">AI Health Insights</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Positive Behaviors */}
          <div className="p-6 border border-green-500/30 rounded-lg bg-green-500/5 space-y-3">
            <h3 className="font-semibold text-sm text-green-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              What You're Doing Well
            </h3>
            <ul className="space-y-2">
              {aiSummary.positiveBehaviors.map((behavior, idx) => (
                <li key={idx} className="text-sm text-muted-foreground">
                  • {behavior}
                </li>
              ))}
            </ul>
          </div>

          {/* Areas For Improvement */}
          <div className="p-6 border border-orange-500/30 rounded-lg bg-orange-500/5 space-y-3">
            <h3 className="font-semibold text-sm text-orange-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Areas For Improvement
            </h3>
            <ul className="space-y-2">
              {aiSummary.areasForImprovement.map((area, idx) => (
                <li key={idx} className="text-sm text-muted-foreground">
                  • {area}
                </li>
              ))}
            </ul>
          </div>

          {/* Next Steps */}
          <div className="p-6 border border-blue-500/30 rounded-lg bg-blue-500/5 space-y-3">
            <h3 className="font-semibold text-sm text-blue-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Next Steps
            </h3>
            <ul className="space-y-2">
              {aiSummary.nextSteps.map((step, idx) => (
                <li key={idx} className="text-sm text-muted-foreground">
                  • {step}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
        <p>Report generated on {new Date().toLocaleDateString()}</p>
        <p className="mt-1">Keep up the great work with your nutrition tracking!</p>
      </div>
    </div>
  );
}
