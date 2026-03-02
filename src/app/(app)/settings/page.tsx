'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, getDoc, query, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { ArrowLeft, Save, Loader2, AlertCircle, CheckCircle, Upload, X, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '@/lib/types/user-profile';
import { calculateBMI, calculateMacroGoals } from '@/lib/types/user-profile';

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Personal details - Imperial units as default
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male');
  const [heightInches, setHeightInches] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [currentWeightLbs, setCurrentWeightLbs] = useState('');
  const [currentWeightDisplay, setCurrentWeightDisplay] = useState('');
  const [goalWeightLbs, setGoalWeightLbs] = useState('');
  const [goalWeightDisplay, setGoalWeightDisplay] = useState('');
  const [goalWeightDate, setGoalWeightDate] = useState('');

  // Unit preferences - Imperial as default
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft-in'>('ft-in');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('lbs');

  // Calculated
  const [bmi, setBmi] = useState(0);
  const [goalBmi, setGoalBmi] = useState(0);
  const [macroGoals, setMacroGoals] = useState<any>(null);

  // Blood panel
  const [bloodPanelFile, setBloodPanelFile] = useState<File | null>(null);
  const [bloodPanelUploading, setBloodPanelUploading] = useState(false);
  const [bloodPanelData, setBloodPanelData] = useState<any>(null);
  const [bloodPanelError, setBloodPanelError] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Multi-profile management
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  // Convert height cm to feet and inches
  const cmToFeetInches = (cm: number) => {
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return { feet, inches };
  };

  // Convert feet and inches to cm
  const feetInchesToCm = (feet: number, inches: number) => {
    return Math.round((feet * 12 + inches) * 2.54);
  };

  // Convert kg to lbs
  const kgToLbs = (kg: number) => Math.round(kg * 2.20462 * 10) / 10;

  // Convert lbs to kg
  const lbsToKg = (lbs: number) => Math.round(lbs / 2.20462 * 10) / 10;

  // Load existing profile(s) and active profile
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      try {
        // Load the main settings doc to get activeProfileId
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
        let mainProfile = null;
        let activeId = null;

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
          activeId = 'main';
        }

        setProfiles(loadedProfiles);
        setActiveProfileId(activeId || (loadedProfiles[0]?.profileId || 'main'));

        // Load the active profile data into the form
        const activeProfile = loadedProfiles.find(p => p.profileId === (activeId || (loadedProfiles[0]?.profileId || 'main'))) || mainProfile;
        if (activeProfile) {
          setName(activeProfile.name || '');
          setAge(String(activeProfile.age || ''));
          setSex(activeProfile.sex || 'male');

          // Load height - store as inches and derive feet/inches for display
          const htInches = activeProfile.heightInches || 0;
          setHeightInches(String(htInches));
          if (htInches > 0) {
            const feet = Math.floor(htInches / 12);
            const inches = Math.round(htInches % 12);
            setHeightFeet(String(feet));
            setHeightInches(String(inches));
          }
          setHeightCm(String(Math.round(htInches * 2.54)));

          // Load and display weights in lbs
          setCurrentWeightLbs(String(activeProfile.currentWeightLbs || ''));
          setCurrentWeightDisplay(String(activeProfile.currentWeightLbs || ''));
          setGoalWeightLbs(String(activeProfile.goalWeightLbs || ''));
          setGoalWeightDisplay(String(activeProfile.goalWeightLbs || ''));
          setGoalWeightDate(activeProfile.goalWeightDate || '');

          if (activeProfile.bloodPanel) {
            setBloodPanelData(activeProfile.bloodPanel);
          }
        }
      } catch (e: any) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user]);

  // Calculate BMI and macro goals when personal details change
  useEffect(() => {
    let height = parseFloat(heightInches);
    let currentWeight = parseFloat(currentWeightDisplay);
    let goalWeight = parseFloat(goalWeightDisplay);
    const ageNum = parseInt(age);

    // If in cm/kg mode, convert to inches/lbs
    if (heightUnit === 'cm') {
      height = parseFloat(heightCm) / 2.54; // cm to inches
    } else if (heightFeet) {
      // In ft-in mode, combine feet and inches
      const feet = parseFloat(heightFeet) || 0;
      const inches = parseFloat(heightInches) || 0;
      height = feet * 12 + inches;
    }

    if (weightUnit === 'kg') {
      currentWeight = kgToLbs(currentWeight);
      goalWeight = kgToLbs(goalWeight);
    }

    if (height > 0 && currentWeight > 0) {
      setBmi(calculateBMI(height, currentWeight));
    }

    if (height > 0 && goalWeight > 0) {
      setGoalBmi(calculateBMI(height, goalWeight));
    }

    if (height > 0 && goalWeight > 0 && ageNum > 0) {
      const goals = calculateMacroGoals(ageNum, sex, height, currentWeight, goalWeight, goalWeightDate || undefined);
      setMacroGoals(goals);
    }
  }, [heightInches, heightFeet, heightCm, currentWeightDisplay, goalWeightDisplay, age, sex, heightUnit, weightUnit, goalWeightDate]);

  const handleSaveProfile = async () => {
    if (!user) return;

    // Prepare height in inches
    let finalHeightInches = 0;
    if (heightUnit === 'cm') {
      const cm = parseFloat(heightCm) || 0;
      finalHeightInches = cm / 2.54;
    } else {
      const feet = parseFloat(heightFeet) || 0;
      const inches = parseFloat(heightInches) || 0;
      finalHeightInches = feet * 12 + inches;
    }

    // Prepare current weight in lbs
    let finalCurrentWeightLbs = parseFloat(currentWeightDisplay) || 0;
    if (weightUnit === 'kg') {
      finalCurrentWeightLbs = kgToLbs(finalCurrentWeightLbs);
    }

    // Prepare goal weight in lbs
    let finalGoalWeightLbs = parseFloat(goalWeightDisplay) || 0;
    if (weightUnit === 'kg') {
      finalGoalWeightLbs = kgToLbs(finalGoalWeightLbs);
    }

    if (!name || !age || !finalHeightInches || !finalCurrentWeightLbs || !finalGoalWeightLbs) {
      setError('Please fill in all personal details');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const profile: UserProfile = {
        name,
        age: parseInt(age),
        sex,
        heightInches: Math.round(finalHeightInches * 10) / 10,
        currentWeightLbs: Math.round(finalCurrentWeightLbs * 10) / 10,
        goalWeightLbs: Math.round(finalGoalWeightLbs * 10) / 10,
        goalWeightDate: goalWeightDate || undefined,
        bmi,
        goalBmi,
        daysToGoal: macroGoals?.daysToGoal,
        weeklyWeightChange: macroGoals?.weeklyWeightChange,
        dailyCalorieAdjustment: macroGoals?.dailyCalorieAdjustment,
        dailyCalorieGoal: macroGoals?.dailyCalorieGoal,
        dailyProteinGoal: macroGoals?.dailyProteinGoal,
        dailyCarbsGoal: macroGoals?.dailyCarbsGoal,
        dailyFatGoal: macroGoals?.dailyFatGoal,
        bloodPanel: bloodPanelData,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', user.uid, 'profile', 'settings'), profile);
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (e: any) {
      setError(e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!user || !newProfileName.trim()) {
      setError('Please enter a profile name');
      return;
    }

    if (profiles.length >= 3) {
      setError('Maximum 3 profiles allowed');
      return;
    }

    try {
      setSaving(true);
      const profileId = `profile-${Date.now()}`;
      const newProfile: UserProfile = {
        name: newProfileName,
        age: 25,
        sex: 'male',
        heightInches: 70,
        currentWeightLbs: 170,
        goalWeightLbs: 170,
        updatedAt: new Date().toISOString(),
        profileId,
      };

      await setDoc(doc(db, 'users', user.uid, 'profiles', profileId), newProfile);
      
      // Update active profile reference in main settings
      const mainProfile = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
      await setDoc(doc(db, 'users', user.uid, 'profile', 'settings'), 
        { ...mainProfile.data(), profileId },
        { merge: true }
      );

      setProfiles([...profiles, newProfile]);
      setActiveProfileId(profileId);
      setNewProfileName('');
      setShowProfileForm(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to create profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    if (!user) return;

    try {
      setSaving(true);
      
      // Load the selected profile
      const profileDoc = await getDoc(doc(db, 'users', user.uid, 'profiles', profileId));
      const profile = profileDoc.data() as UserProfile;

      if (profile) {
        // Set form fields from selected profile
        setName(profile.name || '');
        setAge(String(profile.age || ''));
        setSex(profile.sex || 'male');

        const htInches = profile.heightInches || 0;
        setHeightInches(String(htInches));
        if (htInches > 0) {
          const feet = Math.floor(htInches / 12);
          const inches = Math.round(htInches % 12);
          setHeightFeet(String(feet));
          setHeightInches(String(inches));
        }
        setHeightCm(String(Math.round(htInches * 2.54)));

        setCurrentWeightLbs(String(profile.currentWeightLbs || ''));
        setCurrentWeightDisplay(String(profile.currentWeightLbs || ''));
        setGoalWeightLbs(String(profile.goalWeightLbs || ''));
        setGoalWeightDisplay(String(profile.goalWeightLbs || ''));
        setGoalWeightDate(profile.goalWeightDate || '');

        if (profile.bloodPanel) {
          setBloodPanelData(profile.bloodPanel);
        }

        // Update active profile in settings
        const settingsDoc = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
        await setDoc(doc(db, 'users', user.uid, 'profile', 'settings'),
          { ...settingsDoc.data(), profileId },
          { merge: true }
        );

        setActiveProfileId(profileId);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to switch profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!user) return;

    if (profiles.length <= 1) {
      setError('Cannot delete the only profile');
      return;
    }

    try {
      setSaving(true);
      
      // Delete the profile
      await deleteDoc(doc(db, 'users', user.uid, 'profiles', profileId));

      const updatedProfiles = profiles.filter(p => p.profileId !== profileId);
      setProfiles(updatedProfiles);

      // Switch to another profile if deleted profile was active
      if (activeProfileId === profileId && updatedProfiles.length > 0) {
        await handleSwitchProfile(updatedProfiles[0].profileId || 'main');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to delete profile');
    } finally {
      setSaving(false);
    }
  };

  const handleBloodPanelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBloodPanelFile(file);
    setBloodPanelUploading(true);
    setBloodPanelError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/analyze-blood-panel', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze blood panel');

      setBloodPanelData({
        uploadDate: new Date().toISOString(),
        rawText: file.name,
        extractedValues: data.extractedValues,
        summary: data.summary,
        concerns: data.concerns,
        recommendations: data.recommendations,
      });
    } catch (err: any) {
      setBloodPanelError(err.message || 'Failed to upload blood panel');
    } finally {
      setBloodPanelUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-gray-500">Personalize your nutrition goals</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-900">Profile saved! Redirecting...</p>
        </div>
      )}

      {/* PROFILE MANAGEMENT */}
      <Card>
        <CardHeader>
          <CardTitle>My Profiles</CardTitle>
          <CardDescription>Manage up to 3 profiles for different fitness goals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Active Profile</Label>
            <div className="flex gap-2">
              <select
                value={activeProfileId || 'main'}
                onChange={e =>handleSwitchProfile(e.target.value)}
                disabled={saving}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {profiles.map(profile => (
                  <option key={profile.profileId} value={profile.profileId || 'main'}>
                    {profile.name} ({profile.profileId === activeProfileId ? 'Active' : 'Inactive'})
                  </option>
                ))}
              </select>
              {profiles.length > 1 && activeProfileId !== 'main' && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteProfile(activeProfileId || 'main')}
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {profiles.length < 3 && (
            <div className="space-y-2">
              {!showProfileForm ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowProfileForm(true)}
                  disabled={saving}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Profile
                </Button>
              ) : (
                <div className="space-y-2 p-3 border rounded-lg">
                  <Input
                    placeholder="Profile name (e.g., Cutting, Bulking)"
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreateProfile}
                      disabled={saving || !newProfileName.trim()}
                    >
                      Create
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowProfileForm(false);
                        setNewProfileName('');
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {profiles.length > 0 && (
            <div className="text-xs text-gray-600">
              {profiles.length} of 3 profiles used
            </div>
          )}
        </CardContent>
      </Card>

      {/* PERSONAL DETAILS */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Details</CardTitle>
          <CardDescription>Your information helps calculate personalized nutrition goals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Age</Label>
              <Input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="25" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Sex</Label>
              <select
                value={sex}
                onChange={e => setSex(e.target.value as any)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Height</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setHeightUnit('cm')}
                  className={`px-2 py-1 text-xs rounded ${heightUnit === 'cm' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  cm
                </button>
                <button
                  onClick={() => setHeightUnit('ft-in')}
                  className={`px-2 py-1 text-xs rounded ${heightUnit === 'ft-in' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  ft/in
                </button>
              </div>
            </div>
            {heightUnit === 'cm' ? (
              <Input
                type="number"
                value={heightCm}
                onChange={e => {
                  const val = e.target.value;
                  setHeightCm(val);
                  if (val) {
                    const cm = parseFloat(val);
                    const { feet, inches } = cmToFeetInches(cm);
                    setHeightFeet(String(feet));
                    setHeightInches(String(inches));
                  }
                }}
                placeholder="180"
              />
            ) : (
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={heightFeet}
                  onChange={e => {
                    const val = e.target.value;
                    setHeightFeet(val);
                    if (val) {
                      const feet = parseFloat(val);
                      const inches = parseFloat(heightInches) || 0;
                      const cm = feetInchesToCm(feet, inches);
                      setHeightCm(String(cm));
                    }
                  }}
                  placeholder="5"
                  className="flex-1"
                />
                <span className="py-2 text-gray-600">ft</span>
                <Input
                  type="number"
                  value={heightInches}
                  onChange={e => {
                    const val = e.target.value;
                    setHeightInches(val);
                    if (val) {
                      const feet = parseFloat(heightFeet) || 0;
                      const inches = parseFloat(val);
                      const cm = feetInchesToCm(feet, inches);
                      setHeightCm(String(cm));
                    }
                  }}
                  placeholder="10"
                  max="11"
                  className="flex-1"
                />
                <span className="py-2 text-gray-600">in</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Current BMI</Label>
            <Input type="text" value={bmi.toFixed(1)} disabled className="bg-gray-50" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Weight</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setWeightUnit('kg')}
                  className={`px-2 py-1 text-xs rounded ${weightUnit === 'kg' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  kg
                </button>
                <button
                  onClick={() => setWeightUnit('lbs')}
                  className={`px-2 py-1 text-xs rounded ${weightUnit === 'lbs' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  lbs
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Current Weight</Label>
              <Input
                type="number"
                value={currentWeightDisplay}
                onChange={e => setCurrentWeightDisplay(e.target.value)}
                placeholder={weightUnit === 'kg' ? '75' : '165'}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Goal Weight</Label>
              <Input
                type="number"
                value={goalWeightDisplay}
                onChange={e => setGoalWeightDisplay(e.target.value)}
                placeholder={weightUnit === 'kg' ? '70' : '154'}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Goal BMI</Label>
            <Input type="text" value={goalBmi.toFixed(1)} disabled className="bg-gray-50" />
          </div>

          <div className="space-y-2 pt-2">
            <Label>Goal Weight Date (Optional)</Label>
            <Input
              type="date"
              value={goalWeightDate}
              onChange={e => setGoalWeightDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
            {goalWeightDate && macroGoals?.daysToGoal !== undefined && (
              <p className="text-xs text-gray-600">
                {macroGoals.daysToGoal} days • {Math.round(macroGoals.daysToGoal / 7)} weeks • {macroGoals.weeklyWeightChange > 0 ? '+' : ''}{macroGoals.weeklyWeightChange} kg/week
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* CALCULATED MACRO GOALS */}
      {macroGoals && (
        <Card className="bg-gradient-to-br from-teal-50 to-blue-50 border-teal-200">
          <CardHeader>
            <CardTitle className="text-teal-900">Your Daily Nutrition Goals</CardTitle>
            <CardDescription>Calculated based on your personal details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/60 rounded-lg p-3 border border-teal-100">
                <p className="text-xs text-gray-600 uppercase font-medium tracking-wide">Calories</p>
                <p className="text-2xl font-bold text-teal-600">{macroGoals.dailyCalorieGoal}</p>
                <p className="text-xs text-gray-500">kcal/day</p>
              </div>
              <div className="bg-white/60 rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-gray-600 uppercase font-medium tracking-wide">Protein</p>
                <p className="text-2xl font-bold text-blue-600">{macroGoals.dailyProteinGoal}g</p>
                <p className="text-xs text-gray-500">/day</p>
              </div>
              <div className="bg-white/60 rounded-lg p-3 border border-amber-100">
                <p className="text-xs text-gray-600 uppercase font-medium tracking-wide">Carbs</p>
                <p className="text-2xl font-bold text-amber-600">{macroGoals.dailyCarbsGoal}g</p>
                <p className="text-xs text-gray-500">/day</p>
              </div>
              <div className="bg-white/60 rounded-lg p-3 border border-orange-100">
                <p className="text-xs text-gray-600 uppercase font-medium tracking-wide">Fat</p>
                <p className="text-2xl font-bold text-orange-600">{macroGoals.dailyFatGoal}g</p>
                <p className="text-xs text-gray-500">/day</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* WEIGHT GOAL TIMELINE INFO */}
      {goalWeightDate && macroGoals && macroGoals.dailyCalorieAdjustment !== 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Weight Goal Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/60 rounded p-2">
                <p className="text-xs text-blue-600 font-medium">Weekly Change</p>
                <p className="text-lg font-bold text-blue-900">
                  {macroGoals.weeklyWeightChange > 0 ? '+' : ''}{macroGoals.weeklyWeightChange} kg
                </p>
              </div>
              <div className="bg-white/60 rounded p-2">
                <p className="text-xs text-blue-600 font-medium">Daily Adjustment</p>
                <p className={`text-lg font-bold ${macroGoals.dailyCalorieAdjustment < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {macroGoals.dailyCalorieAdjustment > 0 ? '+' : ''}{macroGoals.dailyCalorieAdjustment}
                </p>
              </div>
            </div>
            <p className="text-xs text-blue-900">
              {macroGoals.weeklyWeightChange > 0
                ? `Eating ${macroGoals.dailyCalorieAdjustment > 0 ? 'extra' : 'within'} your goals will add ~${(Math.abs(macroGoals.weeklyWeightChange) * 1000).toFixed(0)} calories per week for muscle gain.`
                : `Creating a ${Math.abs(macroGoals.dailyCalorieAdjustment)}-calorie daily deficit will help you lose weight at a healthy rate.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* BLOOD PANEL (OPTIONAL) */}
      <Card>
        <CardHeader>
          <CardTitle>Blood Panel Results (Optional)</CardTitle>
          <CardDescription>Upload your blood test results for advanced health insights</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!bloodPanelData ? (
            <>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors"
                onClick={() => document.getElementById('blood-panel-input')?.click()}
              >
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="font-medium text-gray-700">Upload blood panel scan</p>
                <p className="text-xs text-gray-500">JPG, PNG, or PDF</p>
              </div>
              <input
                id="blood-panel-input"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleBloodPanelUpload}
                className="hidden"
              />
              {bloodPanelUploading && (
                <div className="flex items-center gap-2 text-sm text-teal-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing blood panel...
                </div>
              )}
              {bloodPanelError && (
                <p className="text-sm text-red-600">{bloodPanelError}</p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-green-900">✓ Blood Panel Uploaded</p>
                    <p className="text-sm text-green-800">{new Date(bloodPanelData.uploadDate).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => setBloodPanelData(null)}
                    className="text-green-600 hover:text-green-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {bloodPanelData.summary && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Summary</p>
                  <p className="text-sm text-gray-700">{bloodPanelData.summary}</p>
                </div>
              )}

              {bloodPanelData.extractedValues && Object.keys(bloodPanelData.extractedValues).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Extracted Values</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(bloodPanelData.extractedValues).slice(0, 6).map(([key, value]) => (
                      <div key={key} className="bg-gray-50 p-2 rounded text-xs">
                        <p className="text-gray-600 font-medium">{key}</p>
                        <p className="text-gray-900 font-semibold">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bloodPanelData.concerns && bloodPanelData.concerns.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-yellow-900 uppercase tracking-wide">Health Observations</p>
                  <ul className="space-y-1">
                    {bloodPanelData.concerns.map((concern: string, i: number) => (
                      <li key={i} className="text-sm text-yellow-900">• {concern}</li>
                    ))}
                  </ul>
                </div>
              )}

              {bloodPanelData.recommendations && bloodPanelData.recommendations.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Dietary Recommendations</p>
                  <ul className="space-y-1">
                    {bloodPanelData.recommendations.map((rec: string, i: number) => (
                      <li key={i} className="text-sm text-blue-900">• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SAVE BUTTON */}
      <Button
        size="lg"
        className="w-full h-12 gap-2 bg-teal-600 hover:bg-teal-700 text-white"
        onClick={handleSaveProfile}
        disabled={saving}
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Profile
          </>
        )}
      </Button>
    </div>
  );
}
