'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Camera, Upload, Loader2, CheckCircle, RefreshCw, ArrowLeft, Utensils, Search, Zap, Type, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { format, parse, subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '@/lib/types/user-profile';
import { calculateMacroGoals } from '@/lib/types/user-profile';

type Step = 'capture' | 'analyzing' | 'confirm' | 'saving' | 'done';
type Mode = 'camera' | 'quick' | 'text';

interface FoodResult {
  foodName: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  portionSizeGrams: number;
}

interface USDAFood extends FoodResult {
  fdcId: number;
  category: string;
}

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/webp', 'image/bmp', 'image/tiff', 'image/heic',
  'image/heif', 'image/avif',
].join(',');

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_DATA_URI_SIZE = 10 * 1024 * 1024; // 10 MB for data URI

async function toCompatibleDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    
    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      img.src = '';
      reject(new Error('Image processing timed out. Please try a different image.'));
    }, 10000);
    
    img.onload = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error('Canvas not supported'));
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const dataUri = canvas.toDataURL('image/jpeg', 0.85);
      
      // Check data URI size
      if (dataUri.length > MAX_DATA_URI_SIZE) {
        reject(new Error('Image is too large to process. Please use a smaller image.'));
        return;
      }
      
      resolve(dataUri);
    };
    
    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result as string;
        if (dataUri.length > MAX_DATA_URI_SIZE) {
          reject(new Error('Image is too large to process. Please use a smaller image.'));
        } else {
          resolve(dataUri);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    };
    img.src = url;
  });
}

async function analyzeFoodText(description: string): Promise<FoodResult> {
  if (!description || description.trim().length === 0) {
    throw new Error('Please enter a food description');
  }

  try {
    const response = await fetch('/api/analyze-food-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });
    
    if (!response.ok) {
      let errorMessage = 'Failed to analyze food description';
      const contentType = response.headers.get('content-type');
      
      try {
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } else {
          const text = await response.text();
          if (text) {
            errorMessage = text;
          }
        }
      } catch (parseError) {
        console.warn('[ANALYZE_FOOD_CLIENT] Failed to parse error response:', parseError);
      }
      
      throw new Error(errorMessage);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new Error('Invalid response format from server');
    }

    const result = await response.json();
    
    // Validate the response has required fields
    if (!result.foodName || result.calories === undefined || result.proteinGrams === undefined || 
        result.carbsGrams === undefined || result.fatGrams === undefined || result.portionSizeGrams === undefined) {
      throw new Error('AI response was incomplete. Please try a different description.');
    }

    return result as FoodResult;
  } catch (error: any) {
    console.error('[ANALYZE_FOOD_CLIENT] Error analyzing text:', {
      description: description.substring(0, 100),
      error: error.message,
    });
    throw error;
  }
}

// Ensure user has a profile document (safety check for users who signed up before profile auto-creation)
async function ensureUserProfile(uid: string): Promise<string> {
  try {
    console.log('[ENSURE_PROFILE] Checking if profile exists for user:', uid);
    const profileDoc = await getDoc(doc(db, 'users', uid, 'profile', 'settings'));
    
    if (profileDoc.exists()) {
      const profileData = profileDoc.data();
      console.log('[ENSURE_PROFILE] ✅ Profile exists, profileId:', profileData.profileId || 'main');
      return profileData.profileId || 'main';
    }
    
    // Profile doesn't exist - create default one
    console.warn('[ENSURE_PROFILE] Profile missing for user, creating default profile');
    const defaultProfile = {
      name: 'User',
      age: 25,
      sex: 'other',
      heightInches: 70,
      currentWeightLbs: 150,
      goalWeightLbs: 150,
      profileId: 'main',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    const macroGoals = calculateMacroGoals(
      defaultProfile.age,
      defaultProfile.sex,
      defaultProfile.heightInches,
      defaultProfile.currentWeightLbs,
      defaultProfile.goalWeightLbs
    );
    
    const profileWithGoals = {
      ...defaultProfile,
      ...macroGoals,
    };
    
    console.log('[ENSURE_PROFILE] Creating new profile with goals:', {
      profileId: profileWithGoals.profileId,
      dailyCalorieGoal: profileWithGoals.dailyCalorieGoal,
    });
    
    await setDoc(doc(db, 'users', uid, 'profile', 'settings'), profileWithGoals);
    console.log('[ENSURE_PROFILE] ✅ Created missing profile for user:', uid);
    return 'main';
  } catch (error: any) {
    console.error('[ENSURE_PROFILE] ❌ Failed to ensure profile exists:', {
      error: error.message,
      errorCode: error.code,
      uid,
      errorStack: error.stack?.substring(0, 300),
    });
    return 'main'; // Return main as fallback
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function LogPage() {
  const { user } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('camera');
  const [step, setStep] = useState<Step>('capture');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<FoodResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // USDA search state
  const [search, setSearch] = useState('');
  const [usdaResults, setUsdaResults] = useState<USDAFood[]>([]);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [usdaError, setUsdaError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const debouncedSearch = useDebounce(search, 500);

  // Text state
  const [textInput, setTextInput] = useState('');
  const [textAnalyzing, setTextAnalyzing] = useState(false);

  // Date picker state for logging past meals
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [dateError, setDateError] = useState<string | null>(null);

  // Calculate min/max dates (30 days back from today)
  const today = new Date();
  const minDate = subDays(today, 30);
  const minDateString = format(minDate, 'yyyy-MM-dd');
  const maxDateString = format(today, 'yyyy-MM-dd');

  // Reset to today's date on component mount to ensure fresh state on page load
  useEffect(() => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setDateError(null);
  }, []);

  // Handle date selection with 30-day validation
  const handleDateChange = (value: string) => {
    if (value < minDateString) {
      setDateError('You can only log meals from the last 30 days.');
      return;
    }
    if (value > maxDateString) {
      setDateError('You cannot log meals in the future.');
      return;
    }
    setSelectedDate(value);
    setDateError(null);
  };

  // Nutrition feedback state
  const [feedback, setFeedback] = useState<any>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  // User profile state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // USDA search on debounced input
  useEffect(() => {
    if (!debouncedSearch.trim() || debouncedSearch.length < 2) {
      setUsdaResults([]);
      setHasSearched(false);
      return;
    }
    const fetchFoods = async () => {
      setUsdaLoading(true);
      setUsdaError(null);
      setHasSearched(true);
      try {
        const res = await fetch(`/api/search-foods?q=${encodeURIComponent(debouncedSearch)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setUsdaResults(data.foods || []);
      } catch (e: any) {
        setUsdaError('Failed to search. Please try again.');
        setUsdaResults([]);
      } finally {
        setUsdaLoading(false);
      }
    };
    fetchFoods();
  }, [debouncedSearch]);

  // Load user profile for personalized goals and blood panel
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      try {
        const profileDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
        if (profileDoc.exists()) {
          const profileData = profileDoc.data() as UserProfile;
          setUserProfile(profileData);
          setActiveProfileId(profileData.profileId || 'main');
        }
      } catch (e) {
        // Profile not found
      }
    };
    loadProfile();
  }, [user]);

  const handleImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    if (file.size > MAX_FILE_SIZE) { setError(`Image is too large. Maximum size is 20 MB (your file is ${(file.size / 1024 / 1024).toFixed(1)} MB).`); return; }
    
    console.log('[LOG_PAGE_CAMERA] Image file selected:', {
      fileName: file.name,
      fileSize: (file.size / 1024 / 1024).toFixed(2) + 'MB',
      fileType: file.type,
    });
    
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
    setStep('analyzing');
    try {
      console.log('[LOG_PAGE_CAMERA] Converting image to data URI...');
      const dataUri = await toCompatibleDataUri(file);
      
      if (!dataUri) {
        throw new Error('Failed to process image. Please try a different photo.');
      }

      console.log('[LOG_PAGE_CAMERA] ✅ Data URI created, size:', (dataUri.length / 1024 / 1024).toFixed(2) + 'MB');
      console.log('[LOG_PAGE_CAMERA] Sending image to AI for analysis...');
      const response = await fetch('/api/identify-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoDataUri: dataUri }),
      });

      console.log('[LOG_PAGE_CAMERA] AI response status:', response.status);
      
      if (!response.ok) {
        let errorMessage = 'Failed to analyze image';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          console.warn('[LOG_PAGE_CAMERA] Failed to parse error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      const identified = await response.json();
      console.log('[LOG_PAGE_CAMERA] ✅ AI analysis successful:', { 
        foodName: identified.foodName,
        calories: identified.calories,
        portionSizeGrams: identified.portionSizeGrams,
      });
      setResult(identified);
      setStep('confirm');
    } catch (e: any) {
      console.error('[LOG_PAGE_CAMERA] ❌ Image analysis failed:', {
        error: e.message,
        fileName: file.name,
        fileSize: file.size,
        errorStack: e.stack?.substring(0, 300),
      });
      setError(e.message || 'Failed to analyze image. Please try another photo.');
      setStep('capture');
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImage(file);
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setIsDragging(true); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImage(file);
  };

  const handleQuickSelect = (food: FoodResult) => {
    setResult(food);
    setImagePreview(null);
    setStep('confirm');
  };

  const analyzeTextInput = async () => {
    if (!textInput.trim()) return;
    setTextAnalyzing(true);
    setError(null);
    try {
      const identified = await analyzeFoodText(textInput);
      setResult(identified);
      setImagePreview(null);
      setStep('confirm');
    } catch (e: any) {
      setError(e.message || 'Failed to analyze. Please try again.');
    } finally {
      setTextAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!user || !result) return;
    setStep('saving');
    console.log('[LOG_PAGE_SAVE] Starting save process:', {
      hasUser: !!user,
      hasResult: !!result,
      hasImageFile: !!imageFile,
      mode,
      activeProfileId,
    });
    
    try {
      // Ensure user has profile (safety check)
      console.log('[LOG_PAGE_SAVE] Ensuring profile exists for user:', user.uid);
      const profileId = await ensureUserProfile(user.uid);
      console.log('[LOG_PAGE_SAVE] ✅ Profile check complete, profileId:', profileId);
      
      // Skip image upload - we don't need the actual photo since AI already analyzed it
      // The nutrition data is what matters, not the image
      let imageUrl: string | null = null;
      console.log('[LOG_PAGE_SAVE] Skipping image upload (not required for food entry)');
      
      // Use selectedDate instead of today to support logging past meals
      const entryData = {
        ...result, 
        imageUrl,  // Will be null, but that's okay
        createdAt: serverTimestamp(), 
        profileId: profileId || activeProfileId || 'main',
      };
      
      console.log('[LOG_PAGE_SAVE] Saving food entry to Firestore:', {
        entryData: { ...entryData, createdAt: '[timestamp]' },
        path: `users/${user.uid}/days/${selectedDate}/entries`,
      });
      
      await addDoc(collection(db, 'users', user.uid, 'days', selectedDate, 'entries'), entryData);
      console.log('[LOG_PAGE_SAVE] ✅ Entry saved successfully');
      
      // Fetch all entries for the selected date to get daily totals
      console.log('[LOG_PAGE_SAVE] Fetching all entries for date to calculate totals...');
      const { getDocs, query, where } = await import('firebase/firestore');
      const entriesRef = collection(db, 'users', user.uid, 'days', selectedDate, 'entries');
      const entriesSnapshot = await getDocs(entriesRef);
      
      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      
      entriesSnapshot.forEach(doc => {
        const entry = doc.data();
        totalCalories += entry.calories || 0;
        totalProtein += entry.proteinGrams || 0;
        totalCarbs += entry.carbsGrams || 0;
        totalFat += entry.fatGrams || 0;
      });
      
      console.log('[LOG_PAGE_SAVE] Daily totals calculated:', {
        totalCalories,
        totalProtein,
        totalCarbs,
        totalFat,
        entryCount: entriesSnapshot.size,
      });
      
      // Get nutrition feedback from AI
      console.log('[LOG_PAGE_SAVE] Requesting nutrition feedback from AI...');
      const feedbackRes = await fetch('/api/analyze-nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyEntry: {
            calories: totalCalories,
            protein: totalProtein,
            carbs: totalCarbs,
            fat: totalFat,
          },
          goals: userProfile ? {
            calories: userProfile.dailyCalorieGoal || 2000,
            protein: userProfile.dailyProteinGoal || 150,
            carbs: userProfile.dailyCarbsGoal || 250,
            fat: userProfile.dailyFatGoal || 65,
          } : undefined,
          bloodPanel: userProfile?.bloodPanel,
        }),
      });
      
      if (feedbackRes.ok) {
        console.log('[LOG_PAGE_SAVE] ✅ Nutrition feedback received');
        const feedbackData = await feedbackRes.json();
        setFeedback(feedbackData);
        setShowFeedback(true);
        setStep('done');
        console.log('[LOG_PAGE_SAVE] ✅ SAVE COMPLETE - Redirecting to dashboard');
        setTimeout(() => router.push('/dashboard'), 4000);
      } else {
        console.log('[LOG_PAGE_SAVE] Nutrition feedback API not OK, status:', feedbackRes.status);
        setStep('done');
        setTimeout(() => router.push('/dashboard'), 1500);
      }
    } catch (e: any) {
      console.error('[LOG_PAGE_SAVE] ❌ SAVE FAILED:', {
        errorMessage: e.message,
        errorCode: e.code,
        errorStack: e.stack?.substring(0, 300),
        errorName: e.name,
        fullError: JSON.stringify(e, null, 2),
        mode,
        imageFilePresent: !!imageFile,
        resultPresent: !!result,
      });
      setError(e.message || 'Failed to save entry.');
      setStep('confirm');
    }
  };

  const reset = () => {
    setStep('capture');
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setError(null);
    setIsDragging(false);
    setTextInput('');
    setSearch('');
    setUsdaResults([]);
  };

  const modeButtons: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: 'camera', label: 'Camera', icon: <Camera className="h-4 w-4" /> },
    { id: 'quick', label: 'Search', icon: <Search className="h-4 w-4" /> },
    { id: 'text', label: 'Text', icon: <Type className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Log Food</h1>
        </div>
      </div>

      {/* Date picker */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="log-date" className="text-sm font-medium text-gray-700">
          Logging for: {format(parse(selectedDate, 'yyyy-MM-dd', new Date()), 'EEEE, MMMM d, yyyy')}
        </Label>
        <Input
          id="log-date"
          type="date"
          value={selectedDate}
          onChange={(e) => handleDateChange(e.target.value)}
          min={minDateString}
          max={maxDateString}
          className="max-w-xs"
        />
        {dateError && <p className="text-sm text-red-500">{dateError}</p>}
      </div>

      {/* Mode toggle */}
      {step === 'capture' && (
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          {modeButtons.map(btn => (
            <button key={btn.id} onClick={() => { setMode(btn.id); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                mode === btn.id ? 'bg-white shadow text-teal-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {btn.icon} {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* CAMERA MODE */}
      {step === 'capture' && mode === 'camera' && (
        <div className="flex flex-col gap-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}
            onDragOver={handleDragOver} onDrop={handleDrop}
            className={`aspect-square rounded-2xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-4 transition-colors select-none ${
              isDragging ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-gray-50 hover:border-teal-400 hover:bg-teal-50/50'
            }`}
          >
            <div className={`p-4 rounded-full ${isDragging ? 'bg-teal-100' : 'bg-teal-50'}`}>
              <Camera className={`h-10 w-10 ${isDragging ? 'text-teal-600' : 'text-teal-500'}`} />
            </div>
            {isDragging
              ? <p className="text-sm text-teal-600 font-medium text-center px-8">Drop your image here!</p>
              : <>
                  <p className="text-sm text-gray-500 font-medium text-center px-8">Drag & drop or click to browse</p>
                  <p className="text-xs text-gray-300 text-center px-8">JPEG, PNG, HEIC, WEBP, AVIF and more</p>
                </>
            }
          </div>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button size="lg" className="h-14 text-base gap-2 bg-teal-600 hover:bg-teal-700" onClick={() => cameraInputRef.current?.click()}>
            <Camera className="h-5 w-5" /> Open Camera
          </Button>
          <Button size="lg" variant="outline" className="h-14 text-base gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-5 w-5" /> Upload Photo
          </Button>
          <input ref={cameraInputRef} type="file" accept={ACCEPTED_TYPES} capture="environment" className="hidden" onChange={handleFileChange} />
          <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {/* USDA SEARCH MODE */}
      {step === 'capture' && mode === 'quick' && (
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search USDA food database..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-9"
              autoFocus
            />
            {search && (
              <button onClick={() => { setSearch(''); setUsdaResults([]); setHasSearched(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Powered by badge */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-100" />
            <span>Powered by USDA FoodData Central</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          {/* Loading */}
          {usdaLoading && (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
              <p className="text-sm text-gray-500">Searching USDA database...</p>
            </div>
          )}

          {/* Error */}
          {usdaError && <p className="text-sm text-red-500 text-center">{usdaError}</p>}

          {/* Empty state */}
          {!usdaLoading && !hasSearched && (
            <div className="text-center py-12 text-gray-400">
              <Search className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Search any food</p>
              <p className="text-xs mt-1">e.g. "chicken breast", "banana", "pizza"</p>
            </div>
          )}

          {/* No results */}
          {!usdaLoading && hasSearched && usdaResults.length === 0 && !usdaError && (
            <div className="text-center py-12 text-gray-400">
              <Utensils className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No results for "{search}"</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          )}

          {/* Results */}
          {!usdaLoading && usdaResults.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400">{usdaResults.length} results — per 100g serving</p>
              {usdaResults.map((food) => (
                <button key={food.fdcId} onClick={() => handleQuickSelect(food)}
                  className="flex items-center gap-3 p-3 rounded-xl border bg-white hover:border-teal-400 hover:bg-teal-50/30 transition-colors text-left">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <Utensils className="h-5 w-5 text-teal-500" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-sm font-medium truncate capitalize">{food.foodName.toLowerCase()}</p>
                    <p className="text-xs text-gray-400">
                      P:{food.proteinGrams}g &bull; C:{food.carbsGrams}g &bull; F:{food.fatGrams}g
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-teal-600">{food.calories}</p>
                    <p className="text-xs text-gray-400">kcal</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TEXT MODE */}
      {step === 'capture' && mode === 'text' && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Type className="h-5 w-5" /> Describe Your Meal
              </CardTitle>
              <CardDescription>Type what you ate and AI will estimate the nutrition</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="e.g. Two scrambled eggs with whole wheat toast and a glass of orange juice"
                rows={5}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button className="w-full h-12 bg-teal-600 hover:bg-teal-700 gap-2" onClick={analyzeTextInput} disabled={!textInput.trim() || textAnalyzing}>
                {textAnalyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</> : <><Zap className="h-4 w-4" /> Analyze with AI</>}
              </Button>
            </CardContent>
          </Card>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-900 font-medium mb-1">💡 Tip: Use your phone's voice-to-text</p>
            <p className="text-xs text-blue-700">Tap the microphone icon on your keyboard to dictate your meal description instead of typing.</p>
          </div>
          <p className="text-xs text-gray-400 text-center px-4">
            Be specific — include quantities, cooking methods, and any extras
          </p>
        </div>
      )}

      {/* ANALYZING */}
      {step === 'analyzing' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          {imagePreview && (
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden mb-4">
              <Image src={imagePreview} alt="Food" fill className="object-cover" />
              <div className="absolute inset-0 bg-black/50" />
            </div>
          )}
          <Loader2 className="h-12 w-12 animate-spin text-teal-600" />
          <p className="text-gray-500 font-medium">Analyzing your food...</p>
          <p className="text-xs text-gray-400">AI is estimating nutrition data</p>
        </div>
      )}

      {/* CONFIRM */}
      {step === 'confirm' && result && (
        <div className="flex flex-col gap-4">
          {imagePreview && (
            <div className="relative h-48 rounded-2xl overflow-hidden">
              <Image src={imagePreview} alt="Food" fill className="object-cover" />
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Utensils className="h-5 w-5" /> Review Entry
              </CardTitle>
              <CardDescription>Edit any values before saving</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Food Name</Label>
                <Input value={result.foodName} onChange={e => setResult({ ...result, foodName: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Calories (kcal)</Label>
                  <Input type="number" value={result.calories} onChange={e => setResult({ ...result, calories: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Portion (g)</Label>
                  <Input type="number" value={result.portionSizeGrams} onChange={e => setResult({ ...result, portionSizeGrams: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Protein (g)</Label>
                  <Input type="number" value={result.proteinGrams} onChange={e => setResult({ ...result, proteinGrams: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Carbs (g)</Label>
                  <Input type="number" value={result.carbsGrams} onChange={e => setResult({ ...result, carbsGrams: Number(e.target.value) })} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Fat (g)</Label>
                  <Input type="number" value={result.fatGrams} onChange={e => setResult({ ...result, fatGrams: Number(e.target.value) })} />
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={reset}>
                  <RefreshCw className="h-4 w-4" /> Back
                </Button>
                <Button className="flex-1 gap-2 bg-teal-600 hover:bg-teal-700" onClick={handleSave}>
                  <CheckCircle className="h-4 w-4" /> Save Entry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SAVING */}
      {step === 'saving' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-teal-600" />
          <p className="text-gray-500">Saving your entry...</p>
        </div>
      )}

      {/* NUTRITION FEEDBACK MODAL */}
      {showFeedback && feedback && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader className="bg-gradient-to-r from-teal-50 to-blue-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-teal-600" />
                Nutrition Insights
              </CardTitle>
              <CardDescription>{feedback.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Alerts */}
              {feedback.alerts && feedback.alerts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Alerts</p>
                  {feedback.alerts.map((alert: any, i: number) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-sm ${
                        alert.type === 'warning'
                          ? 'bg-yellow-50 border border-yellow-200 text-yellow-900'
                          : alert.type === 'success'
                          ? 'bg-green-50 border border-green-200 text-green-900'
                          : 'bg-blue-50 border border-blue-200 text-blue-900'
                      }`}
                    >
                      {alert.type === 'warning' && '⚠️ '}
                      {alert.type === 'success' && '✅ '}
                      {alert.type === 'info' && 'ℹ️ '}
                      {alert.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Macro Balance */}
              {feedback.macroBalance && (
                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Macro Balance</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Protein</span>
                      <span className="font-medium text-teal-600">{feedback.macroBalance.protein}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Carbs</span>
                      <span className="font-medium text-blue-600">{feedback.macroBalance.carbs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fat</span>
                      <span className="font-medium text-orange-600">{feedback.macroBalance.fat}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {feedback.suggestions && feedback.suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Suggestions</p>
                  <ul className="space-y-1">
                    {feedback.suggestions.map((suggestion: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex gap-2">
                        <span className="text-teal-600 mt-0.5">→</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center pt-2">Redirecting in 3 seconds...</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* DONE */}
      {step === 'done' && !showFeedback && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <CheckCircle className="h-16 w-16 text-green-500" />
          <p className="text-xl font-semibold">Entry Saved!</p>
          <p className="text-gray-400 text-sm">Redirecting to dashboard...</p>
        </div>
      )}
    </div>
  );
}
