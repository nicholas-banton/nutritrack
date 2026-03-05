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
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import type { FoodEntry } from '@/lib/types/food-entry';
import type { UserProfile } from '@/lib/types/user-profile';

export default function ReportPage() {
  const [user, loading, error] = useAuthState(auth);
  const router = useRouter();

  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/signin');
      return;
    }

    // Load active profile ID
    const loadActiveProfile = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
        let activeId = 'main';
        
        if (settingsDoc.exists()) {
          const profile = settingsDoc.data() as UserProfile;
          activeId = profile.profileId || 'main';
        }
        
        setActiveProfileId(activeId);
      } catch (err) {
        console.error('[REPORT] Error loading active profile:', err);
        setActiveProfileId('main'); // Default to main profile
      }
    };

    loadActiveProfile();
  }, [user, loading, router]);

  // Fetch report data when user and activeProfileId are ready
  useEffect(() => {
    if (!user || !activeProfileId) return;

    // Fetch the monthly report
    const fetchReport = async () => {
      try {
        setIsLoading(true);
        setReportError(null);

        // Get the user's profile
        const profileDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));

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

        console.log('[REPORT] User Profile:', {
          hasProfile: !!profileDoc.exists(),
          dailyGoal,
          dailyMacroGoals,
          profileName: profile.name,
        });

        console.log('[REPORT] PROFILE FILTERING:', {
          activeProfileId,
          filtering: 'Entries with matching profileId + entries without profileId field (backwards compatible)',
          message: 'Entries from other profiles in the account are excluded. Older entries without profileId are included.',
        });

        // Calculate date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Generate all dates in the range
        const dateRange: string[] = [];
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          dateRange.push(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Fetch food entries from the last 30 days
        // Entries are stored in: users/{uid}/days/{YYYY-MM-DD}/entries/{entryId}
        let foodEntries: FoodEntry[] = [];
        const entriesPerDay: { [key: string]: number } = {};

        console.log('[REPORT] Fetching entries for date range:', {
          startDateStr,
          endDateStr,
          daysToCheck: dateRange.length,
          dateRange: dateRange.slice(0, 5).join(' | ') + ' ... ' + dateRange.slice(-5).join(' | '),
          activeProfileId,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          localStartDate: startDate.toString(),
          localEndDate: endDate.toString(),
        });

        for (const dateStr of dateRange) {
          try {
            const daysRef = collection(db, 'users', user.uid, 'days', dateStr, 'entries');
            // First try: fetch entries with profileId filter
            const entriesQuery = query(
              daysRef,
              where('profileId', '==', activeProfileId)
            );
            const entriesSnap = await getDocs(entriesQuery);
            
            // Second: also fetch entries without profileId (for backwards compatibility)
            // with old entries that don't have this field
            const legacyQuery = query(
              daysRef,
              where('profileId', '==', null)
            );
            let legacySnap: any = null;
            try {
              legacySnap = await getDocs(legacyQuery);
            } catch (err) {
              // Firestore doesn't allow null queries, that's expected
            }

            // Combine both results
            const allDocs = [...entriesSnap.docs];
            if (legacySnap) {
              allDocs.push(...legacySnap.docs);
            }
            
            // Also check if entries exist without the profileId field at all
            const allEntriesRef = query(daysRef);
            const allEntriesSnap = await getDocs(allEntriesRef);
            
            // Filter to only include entries that have profileId == activeProfileId OR no profileId field
            const filteredDocs = allEntriesSnap.docs.filter(doc => {
              const data = doc.data();
              return !data.profileId || data.profileId === activeProfileId;
            });

            entriesPerDay[dateStr] = filteredDocs.length;

            filteredDocs.forEach((doc) => {
              const entryData = doc.data();
              foodEntries.push({
                id: doc.id,
                ...entryData,
              } as FoodEntry);
            });

            // Log all days (including 0 entries) for first 10 days and last few days to diagnose
            const dayIndex = dateRange.indexOf(dateStr);
            const isFirstWeek = dayIndex < 10;
            const isLastWeek = dayIndex >= dateRange.length - 5;
            if (filteredDocs.length > 0 || isFirstWeek || isLastWeek) {
              console.log(`[REPORT] ${dateStr}: ${filteredDocs.length} entries found (including entries without profileId)`);
            }
          } catch (err) {
            // Date might not exist, continue to next
            const dayIndex = dateRange.indexOf(dateStr);
            const isFirstWeek = dayIndex < 10;
            if (isFirstWeek) {
              console.log(`[REPORT] ${dateStr}: No data retrieved`);
            }
          }
        }

        console.log('[REPORT] Data Summary:', {
          datesChecked: dateRange.length,
          totalEntriesFound: foodEntries.length,
          datesWithEntries: Object.entries(entriesPerDay)
            .filter(([_, count]) => count > 0)
            .map(([date, count]) => `${date} (${count} entries)`),
          datesWithoutEntries: Object.entries(entriesPerDay)
            .filter(([_, count]) => count === 0)
            .map(([date]) => date),
          dateRange: { startDateStr, endDateStr },
          calorieGoal: dailyGoal,
          dataSourcePath: `users/{uid}/days/{YYYY-MM-DD}/entries/`,
          retrievalMethod: 'getDocs() with where(profileId) filter - Real-time Firestore fetch (not cached)',
          profileId: activeProfileId,
        });

        // Verify that deleted entries are NOT included
        if (foodEntries.length > 0) {
          console.log('[REPORT] Verification: All entries currently in Firestore for profile ' + activeProfileId + ' (includes entries without profileId, deleted entries will NOT appear):', 
            foodEntries.map((e: any) => ({
              id: e.id,
              foodName: e.foodName,
              calories: e.calories,
              profileId: e.profileId || '(not set)',
              date: e.createdAt?.toDate?.()?.toISOString?.() || 'unknown',
            }))
          );
        }

        // Group entries by date
        const dailyData = groupEntriesByDate(foodEntries);

        // Calculate statistics
        const calorieStats = calculateCalorieStats(dailyData, dailyGoal);
        const macroStats = calculateMacroStats(dailyData, dailyMacroGoals);
        const weightStats = calculateWeightStats(profile.weightHistory, profile.goalWeightLbs);
        const weeklyAverages = calculateWeeklyAverages(dailyData, startDateStr);
        const trends = detectHealthTrends(dailyData, calorieStats, macroStats, weightStats, dailyGoal, dailyMacroGoals);

        console.log('[REPORT] Calculated Stats:', {
          calorieStats,
          macroStats,
          weightStats,
          weeklyAverages,
          trendsCount: trends.length,
        });

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
          userName: profile.name || 'User',
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
        setLastRefreshTime(new Date());
        
        console.log('[REPORT] Report generated successfully at', new Date().toISOString());
      } catch (err) {
        console.error('Error fetching report:', err);
        setReportError(err instanceof Error ? err.message : 'Failed to generate report');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [user, activeProfileId]);

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
          <>
            {lastRefreshTime && (
              <div className="mb-4 text-xs text-muted-foreground text-right">
                Data refreshed: {lastRefreshTime.toLocaleString()} (Current data from Firestore)
              </div>
            )}
            <MonthlyReportDashboard report={report} />
          </>
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
