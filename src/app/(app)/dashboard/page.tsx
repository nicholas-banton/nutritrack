'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { collection, query, orderBy, doc, getDoc, deleteDoc, updateDoc, getDocs, setDoc, where } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { format } from 'date-fns';
import { Camera, Utensils, Flame, AlertCircle, CheckCircle, TrendingUp, Zap, Trash2, Edit2, X, Loader2, Activity } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FoodEntry } from '@/lib/types/food-entry';
import type { UserProfile, WeightEntry } from '@/lib/types/user-profile';
import { calculateMacroGoals } from '@/lib/types/user-profile';

const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 250, fat: 65 };

function MacroRing({ value, goal, color, label }: { value: number; goal: number; color: string; label: string }) {
  const pct = Math.min(value / goal, 1);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const isExceeded = value > goal;
  const excess = isExceeded ? Math.round((value - goal) * 10) / 10 : 0;
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold">{Math.round(value)}</span>
        </div>
      </div>
      <span className="text-xs text-gray-500">{label}</span>
      {isExceeded && (
        <span className="text-xs font-semibold text-red-600 mt-0.5">+{excess}g over</span>
      )}
    </div>
  );
}

interface MealCardProps {
  entry: FoodEntry;
  user: any;
  today: string;
  onEdit: (entry: FoodEntry) => void;
  onDelete: (entryId: string) => void;
}

function MealCard({ entry, user, today, onEdit, onDelete }: MealCardProps) {
  return (
    <div className="flex items-center gap-2 py-3 border-b last:border-0 group">
      {entry.imageUrl ? (
        <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
          <Image src={entry.imageUrl} alt={entry.foodName} fill className="object-cover" />
        </div>
      ) : (
        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Utensils className="h-5 w-5 text-gray-400" />
        </div>
      )}
      <div className="flex-grow min-w-0">
        <p className="font-medium text-sm truncate">{entry.foodName}</p>
        <p className="text-xs text-gray-500">{entry.portionSizeGrams}g</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold">{Math.round(entry.calories)}</p>
        <p className="text-xs text-gray-400">kcal</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(entry)}
          className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
          title="Edit meal"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
          title="Delete meal"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface EditMealModalProps {
  entry: FoodEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedEntry: FoodEntry) => Promise<void>;
}

function EditMealModal({ entry, isOpen, onClose, onSave }: EditMealModalProps) {
  const [portionSize, setPortionSize] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setPortionSize(String(entry.portionSizeGrams));
      setSaveError(null);
    }
  }, [entry]);

  if (!isOpen || !entry) return null;

  const handleSave = async () => {
    const newPortionSize = parseFloat(portionSize);
    if (newPortionSize > 0) {
      try {
        setSaveError(null);
        const ratio = newPortionSize / entry.portionSizeGrams;
        const updated: FoodEntry = {
          ...entry,
          portionSizeGrams: newPortionSize,
          calories: Math.round(entry.calories * ratio),
          proteinGrams: Math.round(entry.proteinGrams * ratio * 10) / 10,
          carbsGrams: Math.round(entry.carbsGrams * ratio * 10) / 10,
          fatGrams: Math.round(entry.fatGrams * ratio * 10) / 10,
        };
        await onSave(updated);
      } catch (e: any) {
        setSaveError(e.message || 'Failed to save changes');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit Meal</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="font-medium text-sm">{entry.foodName}</p>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
            <p>Original: {entry.calories} kcal, {entry.proteinGrams}g protein</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Portion Size (grams)</Label>
          <Input
            type="number"
            value={portionSize}
            onChange={e => setPortionSize(e.target.value)}
            min="1"
          />
        </div>

        <div className="bg-blue-50 rounded-lg p-3 space-y-1">
          <p className="text-xs font-medium text-blue-900">Updated Nutrition:</p>
          {portionSize && (
            <>
              <p className="text-sm text-blue-900">{Math.round(parseFloat(portionSize) / entry.portionSizeGrams * entry.calories)} kcal</p>
              <p className="text-xs text-blue-800">{Math.round(parseFloat(portionSize) / entry.portionSizeGrams * entry.proteinGrams * 10) / 10}g protein</p>
            </>
          )}
        </div>

        {saveError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900">
            {saveError}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700">Save Changes</Button>
        </div>
      </div>
    </div>
  );
}

interface WeightEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (weightLbs: number, notes?: string) => Promise<void>;
  currentWeight?: number;
  isLoading?: boolean;
  error?: string;
}

function WeightEntryModal({ isOpen, onClose, onSave, currentWeight, isLoading, error }: WeightEntryModalProps) {
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen && currentWeight) {
      setWeight(String(currentWeight));
      setNotes('');
    }
  }, [isOpen, currentWeight]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const weightLbs = parseFloat(weight);
    if (weightLbs > 50 && weightLbs < 1000) {
      await onSave(weightLbs, notes);
      setWeight('');
      setNotes('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Log Weight</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" disabled={isLoading}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600">Enter your current weight to update your calorie goals.</p>

        <div className="space-y-2">
          <Label>Weight (lbs)</Label>
          <Input
            type="number"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            min="50"
            max="999"
            step="0.1"
            disabled={isLoading}
            placeholder="e.g. 180"
          />
        </div>

        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isLoading}
            placeholder="How do you feel?"
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isLoading}>Cancel</Button>
          <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Weight'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function getNutritionAlerts(totals: any, goals: any) {
  const alerts = [];
  const proteinPercent = (totals.protein / goals.protein) * 100;
  const caloriePercent = (totals.calories / goals.calories) * 100;
  const carbPercent = (totals.carbs / goals.carbs) * 100;
  const fatPercent = (totals.fat / goals.fat) * 100;

  // Protein status
  if (proteinPercent < 50) {
    alerts.push({
      type: 'warning',
      icon: <AlertCircle className="h-4 w-4" />,
      title: 'Low Protein',
      message: `${Math.round(totals.protein)}g of ${goals.protein}g - add protein-rich foods`,
      color: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    });
  } else if (proteinPercent >= 80 && proteinPercent <= 120) {
    alerts.push({
      type: 'success',
      icon: <CheckCircle className="h-4 w-4" />,
      title: 'Great Protein!',
      message: `${Math.round(totals.protein)}g - excellent macronutrient support`,
      color: 'bg-green-50 border-green-200 text-green-900',
    });
  }

  // Calorie status
  if (caloriePercent > 120) {
    alerts.push({
      type: 'warning',
      icon: <AlertCircle className="h-4 w-4" />,
      title: 'Calorie Overload',
      message: `${Math.round(totals.calories)} kcal exceeds your daily goal`,
      color: 'bg-red-50 border-red-200 text-red-900',
    });
  } else if (caloriePercent >= 90 && caloriePercent <= 110) {
    alerts.push({
      type: 'success',
      icon: <CheckCircle className="h-4 w-4" />,
      title: 'Perfect Calorie Balance',
      message: `${Math.round(totals.calories)} kcal - right on track!`,
      color: 'bg-green-50 border-green-200 text-green-900',
    });
  } else if (caloriePercent < 50) {
    alerts.push({
      type: 'info',
      icon: <TrendingUp className="h-4 w-4" />,
      title: 'More to Go',
      message: `${Math.round(goals.calories - totals.calories)} kcal remaining for today`,
      color: 'bg-blue-50 border-blue-200 text-blue-900',
    });
  }

  // Macro balance
  const macroBalance = Math.abs(carbPercent - 50) + Math.abs(fatPercent - 30) + Math.abs(proteinPercent - 20);
  if (macroBalance < 30) {
    alerts.push({
      type: 'success',
      icon: <Zap className="h-4 w-4" />,
      title: 'Balanced Macros',
      message: 'Excellent protein, carb, and fat distribution',
      color: 'bg-green-50 border-green-200 text-green-900',
    });
  }

  return alerts;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [profileSwitching, setProfileSwitching] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [editingMeal, setEditingMeal] = useState<FoodEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showWeightEntry, setShowWeightEntry] = useState(false);
  const [weightEntryLoading, setWeightEntryLoading] = useState(false);
  const [weightEntryError, setWeightEntryError] = useState<string | null>(null);

  // Load all profiles for the dropdown
  useEffect(() => {
    if (!user) return;
    const loadProfiles = async () => {
      try {
        // Load the main settings doc to get activeProfileId
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
        let activeId = 'main';
        let mainProfile = null;

        if (settingsDoc.exists()) {
          mainProfile = settingsDoc.data() as UserProfile;
          activeId = mainProfile.profileId || 'main';
        }

        // Load all profiles from the user's profile subcollection
        const profilesSnapshot = await getDocs(collection(db, 'users', user.uid, 'profiles'));
        const loadedProfiles: UserProfile[] = [];
        
        profilesSnapshot.forEach(doc => {
          loadedProfiles.push({
            ...doc.data(),
            profileId: doc.id,
          } as UserProfile);
        });

        // If no profiles exist, use the main profile
        if (loadedProfiles.length === 0 && mainProfile) {
          mainProfile.profileId = 'main';
          loadedProfiles.push(mainProfile);
        }

        setProfiles(loadedProfiles);
        setActiveProfileId(activeId);
      } catch (e: any) {
        console.error('Failed to load profiles:', e);
      }
    };
    loadProfiles();
  }, [user]);

  // Handle delete meal
  const handleDelete = (entryId: string) => {
    setDeleteConfirm(entryId);
    setDeleteError(null);
  };

  // Switch profile and reload its goals
  const handleSwitchProfile = async (profileId: string) => {
    if (!user) return;

    try {
      setProfileSwitching(true);
      setProfileError(null);

      let profile: UserProfile | null = null;

      if (profileId === 'main') {
        // Load main profile from settings
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
        profile = settingsDoc.data() as UserProfile;
      } else {
        // Load from profiles subcollection
        const profileDoc = await getDoc(doc(db, 'users', user.uid, 'profiles', profileId));
        profile = profileDoc.data() as UserProfile;
      }

      if (profile) {
        // Update active profile in settings
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
        await setDoc(doc(db, 'users', user.uid, 'profile', 'settings'),
          { ...settingsDoc.data(), profileId },
          { merge: true }
        );

        // Update state to trigger goal reload
        setActiveProfileId(profileId);
        setUserProfile(profile);
      }
    } catch (e: any) {
      setProfileError('Failed to switch profile');
      console.error('Profile switch error:', e);
    } finally {
      setProfileSwitching(false);
    }
  };

  // Load user profile with multi-profile support
  useEffect(() => {
    if (!user || !activeProfileId) {
      setProfileLoading(false);
      return;
    }
    const loadProfile = async () => {
      try {
        setProfileLoading(true);
        setProfileError(null);

        // Load the active profile
        let profileData: UserProfile | null = null;
        
        if (activeProfileId === 'main') {
          // Load main profile from settings
          const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
          if (settingsDoc.exists()) {
            profileData = settingsDoc.data() as UserProfile;
          }
        } else {
          // Load from profiles subcollection
          const profileDoc = await getDoc(doc(db, 'users', user.uid, 'profiles', activeProfileId));
          if (profileDoc.exists()) {
            profileData = profileDoc.data() as UserProfile;
          }
        }

        if (profileData) {
          setUserProfile(profileData);
        } else {
          setProfileError('Unable to load profile. Using default goals.');
        }
      } catch (e: any) {
        setProfileError('Failed to load profile. Using default goals.');
        console.error('Profile load error:', e);
      } finally {
        setProfileLoading(false);
      }
    };
    loadProfile();
  }, [user, activeProfileId]);

  // Get goals - use personal goals if available, otherwise use defaults
  const DAILY_GOALS = userProfile
    ? {
        calories: userProfile.dailyCalorieGoal || DEFAULT_GOALS.calories,
        protein: userProfile.dailyProteinGoal || DEFAULT_GOALS.protein,
        carbs: userProfile.dailyCarbsGoal || DEFAULT_GOALS.carbs,
        fat: userProfile.dailyFatGoal || DEFAULT_GOALS.fat,
      }
    : DEFAULT_GOALS;

  const entriesQuery = useMemo(() => {
    if (!user || !activeProfileId) return null;
    return query(
      collection(db, 'users', user.uid, 'days', today, 'entries'),
      where('profileId', '==', activeProfileId),
      orderBy('createdAt', 'desc')
    );
  }, [user, today, activeProfileId]);

  const [snapshot, loading] = useCollection(entriesQuery);
  const entries = snapshot?.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodEntry)) ?? [];

  const totals = useMemo(() => {
    if (!entries) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    return entries.reduce((acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.proteinGrams || 0),
      carbs: acc.carbs + (e.carbsGrams || 0),
      fat: acc.fat + (e.fatGrams || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [entries]);

  const caloriesRemaining = DAILY_GOALS.calories - totals.calories;
  const isExceeded = totals.calories > DAILY_GOALS.calories;
  const isApproaching = !isExceeded && caloriesRemaining > 0 && caloriesRemaining <= 250;

  const nutritionAlerts = useMemo(() => getNutritionAlerts(totals, DAILY_GOALS), [totals]);

  const calPct = Math.min(totals.calories / DAILY_GOALS.calories, 1);

  // Weight entry handler
  const handleSaveWeight = async (weightLbs: number, notes?: string) => {
    if (!user || !userProfile || !activeProfileId) return;
    
    setWeightEntryLoading(true);
    setWeightEntryError(null);
    
    try {
      const weightEntry: WeightEntry = {
        date: today,
        weightLbs,
        notes,
      };
      
      // Update current weight and add to history
      const updatedProfile: UserProfile = {
        ...userProfile,
        currentWeightLbs: weightLbs,
        lastWeighInDate: today,
        weightHistory: [
          ...(userProfile.weightHistory || []).filter(w => w.date !== today),
          weightEntry,
        ],
      };
      
      // Recalculate macro goals with new weight
      const newMacroGoals = calculateMacroGoals(
        userProfile.age,
        userProfile.sex,
        userProfile.heightInches,
        weightLbs,
        userProfile.goalWeightLbs,
        userProfile.goalWeightDate
      );
      
      updatedProfile.dailyCalorieGoal = newMacroGoals.dailyCalorieGoal;
      updatedProfile.dailyProteinGoal = newMacroGoals.dailyProteinGoal;
      updatedProfile.dailyCarbsGoal = newMacroGoals.dailyCarbsGoal;
      updatedProfile.dailyFatGoal = newMacroGoals.dailyFatGoal;
      updatedProfile.dailyCalorieAdjustment = newMacroGoals.dailyCalorieAdjustment;
      updatedProfile.weeklyWeightChange = newMacroGoals.weeklyWeightChange;
      
      // Save to Firebase
      const profilePath = activeProfileId === 'main' 
        ? doc(db, 'users', user.uid, 'profile', 'settings')
        : doc(db, 'users', user.uid, 'profiles', activeProfileId);
      
      await updateDoc(profilePath, {
        currentWeightLbs: weightLbs,
        lastWeighInDate: today,
        weightHistory: updatedProfile.weightHistory,
        dailyCalorieGoal: newMacroGoals.dailyCalorieGoal,
        dailyProteinGoal: newMacroGoals.dailyProteinGoal,
        dailyCarbsGoal: newMacroGoals.dailyCarbsGoal,
        dailyFatGoal: newMacroGoals.dailyFatGoal,
        dailyCalorieAdjustment: newMacroGoals.dailyCalorieAdjustment,
        weeklyWeightChange: newMacroGoals.weeklyWeightChange,
      });
      
      setUserProfile(updatedProfile);
      setShowWeightEntry(false);
      setWeightEntryLoading(false);
    } catch (e: any) {
      setWeightEntryError(e.message || 'Failed to save weight');
      setWeightEntryLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* PROFILE SELECTOR */}
      {profiles.length > 0 && (
        <div className="space-y-2">
          <Label>Profile</Label>
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              disabled={profileSwitching}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-gray-50 disabled:opacity-50"
            >
              <span>
                {activeProfileId === 'main' 
                  ? 'Main Profile' 
                  : profiles.find(p => p.profileId === activeProfileId)?.name || 'Main Profile'}
              </span>
              <span className="text-xs text-gray-500">{profileSwitching ? '...' : '▾'}</span>
            </button>
            {showProfileMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-input rounded-lg shadow-lg z-10">
                <button
                  onClick={() => {
                    handleSwitchProfile('main');
                    setShowProfileMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 ${activeProfileId === 'main' ? 'bg-blue-50 font-medium text-blue-600' : ''}`}
                >
                  Main Profile {activeProfileId === 'main' ? '(Active)' : ''}
                </button>
                {profiles.map(profile => (
                  <button
                    key={profile.profileId}
                    onClick={() => {
                      handleSwitchProfile(profile.profileId || 'main');
                      setShowProfileMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 border-t ${profile.profileId === activeProfileId ? 'bg-blue-50 font-medium text-blue-600' : ''}`}
                  >
                    {profile.name} {profile.profileId === activeProfileId ? '(Active)' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, MMMM do')}</p>
        <h1 className="text-2xl font-bold tracking-tight">Today's Nutrition</h1>
      </div>

      {/* PROFILE LOADING INDICATOR */}
      {profileLoading && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex gap-3">
          <Loader2 className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
          <p className="text-sm text-blue-900">Loading your nutrition goals...</p>
        </div>
      )}

      {/* PROFILE ERROR */}
      {profileError && !profileLoading && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">{profileError}</p>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Flame className="h-4 w-4 text-orange-400" /> Calories
              </p>
              <p className="text-4xl font-bold mt-1">
                {profileLoading ? <Skeleton className="h-10 w-24 inline-block" /> : Math.round(totals.calories)}
              </p>
              <p className="text-sm text-gray-400">of {DAILY_GOALS.calories} goal</p>
              
              {/* Calories Remaining Display */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Remaining Budget</p>
                <div className={`flex items-center gap-2 text-lg font-bold ${
                  isExceeded ? 'text-red-600' : isApproaching ? 'text-amber-600' : 'text-green-600'
                }`}>
                  <span>{isExceeded ? '⚠️' : isApproaching ? '⚡' : '✓'}</span>
                  <span>{isExceeded ? `+${Math.abs(caloriesRemaining)}` : caloriesRemaining} kcal</span>
                </div>
              </div>
            </div>
            <div className="relative w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                <circle cx="48" cy="48" r="40" fill="none" 
                  stroke={isExceeded ? '#dc2626' : isApproaching ? '#f59e0b' : '#0d9488'} 
                  strokeWidth="8"
                  strokeDasharray={`${calPct * 251.3} 251.3`} strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.6s ease' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold">{profileLoading ? '...' : Math.round(calPct * 100)}%</span>
              </div>
            </div>
          </div>
          <div className="flex justify-around mt-6 pt-4 border-t">
            <MacroRing value={totals.protein} goal={DAILY_GOALS.protein} color="#3b82f6" label="Protein" />
            <MacroRing value={totals.carbs} goal={DAILY_GOALS.carbs} color="#f59e0b" label="Carbs" />
            <MacroRing value={totals.fat} goal={DAILY_GOALS.fat} color="#ec4899" label="Fat" />
          </div>
        </CardContent>
      </Card>

      {/* WEIGHT TRACKER CARD */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Weight Tracking</span>
            <button
              onClick={() => setShowWeightEntry(true)}
              className="text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Log Weight
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Current Weight</p>
              <p className="text-xl font-bold mt-1">{userProfile?.currentWeightLbs || '—'} lbs</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Goal Weight</p>
              <p className="text-xl font-bold mt-1">{userProfile?.goalWeightLbs || '—'} lbs</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Daily Calorie Goal</p>
              <p className="text-xl font-bold mt-1">{DAILY_GOALS.calories} kcal</p>
            </div>
          </div>

          {/* Recent Weigh-ins */}
          {userProfile?.weightHistory && userProfile.weightHistory.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Recent Weigh-ins</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {[...userProfile.weightHistory]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 5)
                  .map((entry) => (
                    <div key={entry.date} className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50">
                      <div>
                        <p className="font-medium">{entry.weightLbs} lbs</p>
                        <p className="text-xs text-gray-500">{format(new Date(entry.date), 'MMM d, yyyy')}</p>
                      </div>
                      {entry.notes && <p className="text-xs text-gray-600 italic">{entry.notes}</p>}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {!userProfile?.weightHistory || userProfile.weightHistory.length === 0 && (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">No weigh-ins yet. Log your first weight!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calories Remaining Warning */}
      {!loading && (isExceeded || isApproaching) && (
        <div className={`p-4 rounded-lg border flex gap-3 ${
          isExceeded 
            ? 'bg-red-50 border-red-200' 
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex-shrink-0 mt-0.5">
            {isExceeded ? (
              <AlertCircle className={`h-5 w-5 text-red-600`} />
            ) : (
              <Zap className={`h-5 w-5 text-amber-600`} />
            )}
          </div>
          <div className="flex-grow">
            <p className={`font-medium text-sm ${isExceeded ? 'text-red-900' : 'text-amber-900'}`}>
              {isExceeded 
                ? `You've exceeded your daily calorie goal` 
                : `You're approaching your daily limit`}
            </p>
            <p className={`text-xs mt-1 ${isExceeded ? 'text-red-800' : 'text-amber-800'}`}>
              {isExceeded 
                ? 'Consider lighter meals for the rest of the day.' 
                : 'Choose lighter options for your next meal.'}
            </p>
          </div>
        </div>
      )}
      {!loading && nutritionAlerts.length > 0 && (
        <div className="space-y-2">
          {nutritionAlerts.map((alert, i) => (
            <div key={i} className={`p-3 rounded-lg border flex gap-3 ${alert.color}`}>
              <div className="flex-shrink-0 mt-0.5">
                {alert.icon}
              </div>
              <div className="flex-grow">
                <p className="font-medium text-sm">{alert.title}</p>
                <p className="text-xs opacity-90">{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EDIT MEAL MODAL */}
      <EditMealModal
        entry={editingMeal}
        isOpen={!!editingMeal}
        onClose={() => setEditingMeal(null)}
        onSave={async (updated) => {
          if (user && activeProfileId) {
            try {
              // Verify meal belongs to current profile before updating
              if (updated.profileId === activeProfileId) {
                await updateDoc(doc(db, 'users', user.uid, 'days', today, 'entries', updated.id), {
                  portionSizeGrams: updated.portionSizeGrams,
                  calories: updated.calories,
                  proteinGrams: updated.proteinGrams,
                  carbsGrams: updated.carbsGrams,
                  fatGrams: updated.fatGrams,
                });
                setEditingMeal(null);
              } else {
                console.error('Cannot update meal from a different profile');
              }
            } catch (e) {
              console.error('Failed to update meal:', e);
            }
          }
        }}
      />

      {/* WEIGHT ENTRY MODAL */}
      <WeightEntryModal
        isOpen={showWeightEntry}
        onClose={() => {
          setShowWeightEntry(false);
          setWeightEntryError(null);
        }}
        onSave={handleSaveWeight}
        currentWeight={userProfile?.currentWeightLbs}
        isLoading={weightEntryLoading}
        error={weightEntryError || undefined}
      />

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-bold">Delete this meal?</h2>
            <p className="text-sm text-gray-600">This action cannot be undone.</p>
            {deleteError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900">
                {deleteError}
              </div>
            )}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeleteConfirm(null);
                  setDeleteError(null);
                }} 
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (user && deleteConfirm && activeProfileId) {
                    try {
                      // Verify meal belongs to current profile before deleting
                      const mealToDelete = entries.find(e => e.id === deleteConfirm);
                      if (mealToDelete && mealToDelete.profileId === activeProfileId) {
                        await deleteDoc(doc(db, 'users', user.uid, 'days', today, 'entries', deleteConfirm));
                        setDeleteConfirm(null);
                        setDeleteError(null);
                      } else {
                        setDeleteError('Unable to delete meal. It may belong to a different profile.');
                      }
                    } catch (e: any) {
                      setDeleteError(e.message || 'Failed to delete meal. Please try again.');
                      console.error('Failed to delete meal:', e);
                    }
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR ALL CONFIRMATION MODAL */}
      {clearAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-red-600">Clear all meals?</h2>
            <p className="text-sm text-gray-600">This will delete all {entries?.length} logged meals for today. This action cannot be undone.</p>
            {deleteError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900">
                {deleteError}
              </div>
            )}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setClearAllConfirm(false);
                  setDeleteError(null);
                }} 
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (user && entries && activeProfileId) {
                    try {
                      for (const entry of entries) {
                        // Verify meal belongs to current profile before deleting
                        if (entry.profileId === activeProfileId) {
                          await deleteDoc(doc(db, 'users', user.uid, 'days', today, 'entries', entry.id));
                        }
                      }
                      setClearAllConfirm(false);
                      setDeleteError(null);
                    } catch (e: any) {
                      setDeleteError(e.message || 'Failed to clear meals. Please try again.');
                      console.error('Failed to clear meals:', e);
                    }
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                Clear All
              </Button>
            </div>
          </div>
        </div>
      )}

      <Link href="/log">
        <Button size="lg" className="w-full gap-2 text-base h-14 bg-teal-600 hover:bg-teal-700">
          <Camera className="h-5 w-5" /> Log Food
        </Button>
      </Link>
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Utensils className="h-4 w-4" /> Today's Meals
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2 space-y-3">
          {loading && <div className="space-y-3 pt-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>}
          {!loading && !entries?.length && (
            <div className="text-center py-8 text-gray-400">
              <Utensils className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No meals logged yet today</p>
            </div>
          )}
          {!loading && entries?.length > 0 && (
            <>
              <div className="space-y-0">
                {entries.map(e => (
                  <MealCard
                    key={e.id}
                    entry={e as FoodEntry}
                    user={user}
                    today={today}
                    onEdit={setEditingMeal}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
              {entries.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClearAllConfirm(true)}
                  className="w-full text-red-600 hover:bg-red-50 border-red-200"
                >
                  Clear All Meals
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
