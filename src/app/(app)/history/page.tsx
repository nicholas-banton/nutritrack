'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import { collection, query, orderBy, doc, getDoc, where } from 'firebase/firestore';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { format } from 'date-fns';
import { Utensils, Image as ImageIcon, Loader2 } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { FoodEntry } from '@/lib/types/food-entry';
import { Label } from '@/components/ui/label';

const EntryCard = ({ entry }: { entry: FoodEntry }) => (
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
    </div>
  </Card>
);

export default function HistoryPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const dateId = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Load active profile ID
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
          const settings = settingsDoc.data();
          setActiveProfileId(settings?.profileId || 'main');
        }
      } catch (e: any) {
        console.error('Failed to load active profile:', e);
      } finally {
        setProfileLoading(false);
      }
    };
    loadActiveProfile();
  }, [user]);

  const entriesQuery = useMemo(() => {
    if (!user || !activeProfileId) return null;
    return query(
      collection(db, 'users', user.uid, 'days', dateId, 'entries'),
      where('profileId', '==', activeProfileId),
      orderBy('createdAt', 'desc')
    );
  }, [user, dateId, activeProfileId]);

  const [entries, loading, error] = useCollectionData(entriesQuery);

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
              {entries.map(e => <EntryCard key={e.id} entry={e as FoodEntry} />)}
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
