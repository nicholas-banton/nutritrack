'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { collection, query, orderBy, doc, getDoc, where, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { format } from 'date-fns';
import { Utensils, Image as ImageIcon, Loader2, TrendingDown, TrendingUp, Edit2, Trash2, X, Check } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FoodEntry } from '@/lib/types/food-entry';
import type { UserProfile } from '@/lib/types/user-profile';
import { Label } from '@/components/ui/label';

const EntryCard = ({
  entry,
  onEdit,
  onDelete,
}: {
  entry: FoodEntry;
  onEdit: (entry: FoodEntry) => void;
  onDelete: (entryId: string) => Promise<void>;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Ensure entry has an ID
  const entryId = (entry?.id as string) || 'unknown';

  if (!entry?.foodName || !entryId || entryId === 'unknown') {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4 text-red-600 text-sm">
          Error: Invalid entry data (missing ID)
        </CardContent>
      </Card>
    );
  }

  const handleDelete = async () => {
    if (!entryId || entryId === 'unknown') {
      setDeleteError('Cannot delete entry: Missing entry ID');
      return;
    }
    if (!confirm('Are you sure you want to delete this entry?')) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(entryId);
    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to delete entry. Please try again.';
      setDeleteError(errorMsg);
      console.error('Delete error:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex">
        {entry.imageUrl ? (
          <div className="relative w-24 h-24 flex-shrink-0">
            <Image src={entry.imageUrl} alt={entry.foodName} fill className="object-cover" />
          </div>
        ) : (
          <div className="w-24 h-24 flex-shrink-0 bg-gray-50 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-gray-300" />
          </div>
        )}
        <div className="p-4 flex-grow">
          <p className="font-semibold">{entry.foodName}</p>
          <p className="text-sm text-gray-500">{Math.round(entry.calories)} kcal &bull; {entry.portionSizeGrams}g</p>
          <div className="text-xs text-gray-400 mt-2 grid grid-cols-3 gap-x-2">
            <span>P: {Math.round(entry.proteinGrams)}g</span>
            <span>C: {Math.round(entry.carbsGrams)}g</span>
            <span>F: {Math.round(entry.fatGrams)}g</span>
          </div>
        </div>
        <div className="p-4 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => onEdit(entry)} className="h-8 w-8 p-0 hover:bg-blue-50">
            <Edit2 className="h-4 w-4 text-blue-600" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-8 w-8 p-0 hover:bg-red-50"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin text-red-600" /> : <Trash2 className="h-4 w-4 text-red-600" />}
          </Button>
        </div>
      </div>
      {deleteError && <div className="p-3 bg-red-50 border-t border-red-200 text-sm text-red-700">{deleteError}</div>}
    </Card>
  );
};

const EditEntryModal = ({
  entry,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: {
  entry: FoodEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedEntry: Partial<FoodEntry>) => Promise<void>;
  isSaving: boolean;
}) => {
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [portionSize, setPortionSize] = useState(0);

  useEffect(() => {
    if (entry) {
      setFoodName(entry.foodName);
      setCalories(entry.calories);
      setProtein(entry.proteinGrams);
      setCarbs(entry.carbsGrams);
      setFat(entry.fatGrams);
      setPortionSize(entry.portionSizeGrams);
    }
  }, [entry]);

  const handleSave = async () => {
    if (!entry) return;
    await onSave({
      foodName,
      calories,
      proteinGrams: protein,
      carbsGrams: carbs,
      fatGrams: fat,
      portionSizeGrams: portionSize,
    });
  };

  if (!isOpen || !entry) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Edit Entry</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="food-name" className="text-sm font-medium">
              Food Name
            </Label>
            <Input
              id="food-name"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="Food name"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="calories" className="text-sm font-medium">
                Calories
              </Label>
              <Input
                id="calories"
                type="number"
                value={calories}
                onChange={(e) => setCalories(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="portion" className="text-sm font-medium">
                Portion (g)
              </Label>
              <Input
                id="portion"
                type="number"
                value={portionSize}
                onChange={(e) => setPortionSize(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="protein" className="text-sm font-medium">
                Protein (g)
              </Label>
              <Input
                id="protein"
                type="number"
                value={protein}
                onChange={(e) => setProtein(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="carbs" className="text-sm font-medium">
                Carbs (g)
              </Label>
              <Input
                id="carbs"
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fat" className="text-sm font-medium">
                Fat (g)
              </Label>
              <Input
                id="fat"
                type="number"
                value={fat}
                onChange={(e) => setFat(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-teal-600 hover:bg-teal-700"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const DailySummary = ({ entries, profile, isLoading }: { entries?: FoodEntry[]; profile: UserProfile | null; isLoading: boolean }) => {
  const totals = useMemo(() => {
    if (!entries || entries.length === 0) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    return entries.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.calories,
        protein: acc.protein + entry.proteinGrams,
        carbs: acc.carbs + entry.carbsGrams,
        fat: acc.fat + entry.fatGrams,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [entries]);

  const dailyCalorieGoal = profile?.dailyCalorieGoal || 2000;
  const caloriesDifference = totals.calories - dailyCalorieGoal;
  const isUnderGoal = caloriesDifference < 0;
  const diffText = isUnderGoal
    ? `${Math.abs(Math.round(caloriesDifference))} calories under goal`
    : `${Math.round(caloriesDifference)} calories over goal`;

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50">
      <CardHeader>
        <CardTitle className="text-base">Daily Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Calorie comparison */}
        <div className="flex items-start justify-between pb-4 border-b">
          <div>
            <p className="text-sm text-gray-600 mb-1">Calories</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-teal-600">{Math.round(totals.calories)}</span>
              <span className="text-sm text-gray-500">/ {Math.round(dailyCalorieGoal)}</span>
            </div>
          </div>
          <div className={`text-right ${isUnderGoal ? 'text-orange-600' : 'text-red-600'}`}>
            {isUnderGoal ? <TrendingDown className="h-5 w-5 mb-1" /> : <TrendingUp className="h-5 w-5 mb-1" />}
            <p className="text-sm font-semibold">{diffText}</p>
          </div>
        </div>

        {/* Macro breakdown */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wide">Protein</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{Math.round(totals.protein)}g</p>
            {profile?.dailyProteinGoal && <p className="text-xs text-gray-500 mt-0.5">Goal: {Math.round(profile.dailyProteinGoal)}g</p>}
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wide">Carbs</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{Math.round(totals.carbs)}g</p>
            {profile?.dailyCarbsGoal && <p className="text-xs text-gray-500 mt-0.5">Goal: {Math.round(profile.dailyCarbsGoal)}g</p>}
          </div>
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wide">Fat</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{Math.round(totals.fat)}g</p>
            {profile?.dailyFatGoal && <p className="text-xs text-gray-500 mt-0.5">Goal: {Math.round(profile.dailyFatGoal)}g</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function HistoryPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const dateId = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Edit modal state
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Load active profile ID and user profile
  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }
    const loadActiveProfile = async () => {
      try {
        setProfileLoading(true);
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data() as UserProfile;
          setActiveProfileId(settings?.profileId || 'main');
          setUserProfile(settings);
        }
      } catch (e: any) {
        console.error('Failed to load active profile:', e);
      } finally {
        setProfileLoading(false);
      }
    };
    loadActiveProfile();
  }, [user]);

  // State for entries with proper IDs
  const [entries, setEntries] = useState<(FoodEntry & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load entries with their actual Firestore IDs
  const loadEntries = useCallback(async () => {
    if (!user || !activeProfileId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'users', user.uid, 'days', dateId, 'entries'),
        where('profileId', '==', activeProfileId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const entriesData = snapshot.docs.map((doc) => ({
        ...(doc.data() as FoodEntry),
        id: doc.id, // Firestore document ID
      }));
      setEntries(entriesData);
      setError(null);
    } catch (e: any) {
      console.error('[ENTRIES_LOAD] Error loading entries:', e);
      setError(e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [user, dateId, activeProfileId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleEditEntry = (entry: FoodEntry) => {
    setEditingEntry(entry);
    setIsEditModalOpen(true);
  };

  const handleSaveEditedEntry = async (updatedData: Partial<FoodEntry>) => {
    if (!user || !editingEntry) return;
    try {
      setIsSavingEdit(true);
      const entryRef = doc(db, 'users', user.uid, 'days', dateId, 'entries', editingEntry.id);
      await updateDoc(entryRef, updatedData as any);
      setIsEditModalOpen(false);
      setEditingEntry(null);
    } catch (e: any) {
      console.error('Failed to update entry:', e);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!user) {
      throw new Error('Not authenticated');
    }
    try {
      console.log('[DELETE_ENTRY] Attempting to delete entry:', {
        userId: user.uid,
        dateId,
        entryId,
        path: `users/${user.uid}/days/${dateId}/entries/${entryId}`,
      });

      const entryRef = doc(db, 'users', user.uid, 'days', dateId, 'entries', entryId);
      
      // Check if document exists before deletion
      const entrySnap = await getDoc(entryRef);
      if (!entrySnap.exists()) {
        console.warn('[DELETE_ENTRY] Entry not found:', entryId);
        throw new Error('Entry not found. It may have already been deleted.');
      }

      await deleteDoc(entryRef);
      console.log('[DELETE_ENTRY] ✅ Successfully deleted entry:', entryId);
      // Refetch entries to update UI immediately after deletion
      await loadEntries();
    } catch (e: any) {
      console.error('[DELETE_ENTRY] ❌ Failed to delete entry:', {
        error: e?.message || e,
        code: e?.code,
        entryId,
      });
      
      // Provide more specific error messages
      if (e?.code === 'permission-denied') {
        throw new Error('You do not have permission to delete this entry.');
      } else if (e?.message?.includes('not found')) {
        throw new Error('Entry not found. It may have already been deleted.');
      } else {
        throw new Error(e?.message || 'Failed to delete entry. Please try again.');
      }
    }
  };
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="text-sm text-gray-500">Browse your past meals</p>
      </div>
      <Card>
        <CardContent className="pt-4 flex justify-center">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            disabled={{ after: new Date() }}
          />
        </CardContent>
      </Card>
      
      {/* Daily Summary */}
      {!profileLoading && <DailySummary entries={entries as FoodEntry[]} profile={userProfile} isLoading={loading} />}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Utensils className="h-4 w-4" />
            {format(selectedDate, 'MMMM do, yyyy')}
          </CardTitle>
          <CardDescription>{entries?.length ?? 0} meal{entries?.length !== 1 ? 's' : ''} logged</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>}
          {!loading && !entries?.length && (
            <div className="text-center py-12">
              <Utensils className="mx-auto h-12 w-12 text-gray-200" />
              <h3 className="mt-4 text-base font-medium">No Entries Found</h3>
              <p className="mt-1 text-sm text-gray-400">No meals logged for this day.</p>
            </div>
          )}
          {!loading && entries && entries.length > 0 && (
            <div className="space-y-4">
              {entries.map((e, idx) => {
                const entryId = (e as any)?.id || (e as FoodEntry & { id?: string })?.id;
                const safeKey = entryId || `entry-${idx}`;
                return (
                  <EntryCard
                    key={safeKey}
                    entry={e as FoodEntry}
                    onEdit={handleEditEntry}
                    onDelete={handleDeleteEntry}
                  />
                );
              })}
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error.message}</p>}
        </CardContent>
      </Card>
      
      {/* Edit entry modal */}
      <EditEntryModal
        entry={editingEntry}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingEntry(null);
        }}
        onSave={handleSaveEditedEntry}
        isSaving={isSavingEdit}
      />
    </div>
  );
}
