import { Timestamp } from 'firebase/firestore';

export interface FoodEntry {
  id: string;
  foodName: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  portionSizeGrams: number;
  imageUrl?: string | null;
  createdAt: Timestamp;
}
