'use client';

import React, { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import {
  MonthlyReport,
  groupEntriesByDate,
  calculateCalorieStats,
  calculateMacroStats,
  calculateWeightStats,
  calculateWeeklyAverages,
  detectHealthTrends,
} from '@/lib/utils/monthly-report';
import { MonthlyReportDashboard } from '@/components/monthly-report/dashboard';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { FoodEntry } from '@/lib/types/food-entry';
import type { UserProfile } from '@/lib/types/user-profile';

export default function ReportPage() {
  const [user, loading, error] = useAuthState(auth);
  const router = useRouter();

  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/signin');
      return;
    }

    // Fetch the monthly report
    const fetchReport = async () => {
      try {
        setIsLoading(true);
        setReportError(null);

        // Get the user's profile
        const profileDoc = await (await import('firebase/firestore')).getDoc(
          (await import('firebase/firestore')).doc(db, 'users', user.uid, 'profile', 'settings')
        );

        if (!profileDoc.exists()) {
          setReportError('User profile not found. Please set up your profile first.');
          setIsLoading(false);
          return;
        }

        const profile = profileDoc.data() as UserProfile;
        const dailyGoal = profile.dailyCalorieGoal || 2000;
        const dailyMacroGoals = {
          protein: profile.dailyProteinGoal || 150,
          carbs: profile.dailyCarbsGoal || 200,
          fat: profile.dailyFatGoal || 65,
        };

        // Calculate date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Fetch food entries from the last 30 days
        const entriesRef = collection(db, 'users', user.uid, 'foodEntries');
        const entriesQuery = query(
          entriesRef,
          where('createdAt', '>=', startDate),
          where('createdAt', '<=', endDate)
        );

        const entriesSnap = await getDocs(entriesQuery);
        const foodEntries = entriesSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as FoodEntry[];

        // Group entries by date
        const dailyData = groupEntriesByDate(foodEntries);

        // Calculate statistics
        const calorieStats = calculateCalorieStats(dailyData, dailyGoal);
        const macroStats = calculateMacroStats(dailyData, dailyMacroGoals);
        const weightStats = calculateWeightStats(profile.weightHistory, profile.goalWeightLbs);
        const weeklyAverages = calculateWeeklyAverages(dailyData, startDateStr);
        const trends = detectHealthTrends(dailyData, calorieStats, macroStats, weightStats, dailyGoal, dailyMacroGoals);

        // Get AI insights from the API
        let aiSummary = {
          positiveBehaviors: ['Keep tracking consistently'],
          areasForImprovement: ['Set more specific goals'],
          nextSteps: ['Review your progress weekly'],
        };

        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/monthly-report', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              calorieStats,
              macroStats,
              weightStats,
              trends,
              dailyGoal,
              dailyMacroGoals,
            }),
          });

          if (response.ok) {
            aiSummary = await response.json();
          } else {
            console.error('Error fetching AI insights:', await response.text());
          }
        } catch (aiError) {
          console.error('Error calling AI insights API:', aiError);
        }

        // Build the complete report
        const completeReport: MonthlyReport = {
          period: {
            startDate: startDateStr,
            endDate: endDateStr,
            daysInPeriod: 30,
          },
          goals: {
            dailyCalorie: dailyGoal,
            dailyProtein: dailyMacroGoals.protein,
            dailyCarbs: dailyMacroGoals.carbs,
            dailyFat: dailyMacroGoals.fat,
          },
          calorieStats,
          macroStats,
          weightStats,
          dailyNutrition: Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date)),
          weeklyAverages,
          trends,
          aiSummary,
        };

        setReport(completeReport);
      } catch (err) {
        console.error('Error fetching report:', err);
        setReportError(err instanceof Error ? err.message : 'Failed to generate report');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  if (reportError) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-4 p-6 border border-destructive/30 rounded-lg bg-destructive/5">
            <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-destructive mb-2">Error Generating Report</h2>
              <p className="text-muted-foreground mb-4">{reportError}</p>
              <p className="text-sm text-muted-foreground">
                Please make sure you have logged some food entries and try again later.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {report ? (
          <MonthlyReportDashboard report={report} />
        ) : (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Generating your monthly report...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
