# NutriTracker Project Architecture

## Project Overview
**NutriTracker** is a Next.js 16 TypeScript web application for nutrition tracking and fitness goal management. It integrates Firebase for authentication and Firestore for data storage, with AI-powered features using Google's Genkit and Gemini models.

**Tech Stack:**
- **Frontend:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS 4, shadcn/ui components
- **Backend:** Next.js API routes, Firebase/Firestore
- **AI/ML:** Google Genkit + Gemini 2.5 Flash, Google AI APIs
- **Database:** Firestore (Cloud), Firebase Storage
- **Auth:** Firebase Authentication
- **Additional Libraries:** 
  - `react-firebase-hooks` for real-time Firestore queries
  - `date-fns` for date manipulation
  - `lucide-react` for icons
  - `next-pwa` for PWA support
  - `next-themes` for theme management

---

## Data Models & Firestore Schema

### 1. **User Profile** (`users/{uid}/profile/settings`)
Stores personal health information and goals.

```typescript
interface UserProfile {
  // Basic Info
  name: string;
  age: number;
  sex: 'male' | 'female' | 'other';
  heightInches: number;           // Imperial units (inches)
  currentWeightLbs: number;       // Imperial units (pounds)
  goalWeightLbs: number;          // Target weight in pounds
  goalWeightDate?: string;        // ISO date (YYYY-MM-DD)
  profileId?: string;             // 'main' as default
  
  // Weight Tracking
  weightHistory?: WeightEntry[];  // Array of historical weigh-ins
  lastWeighInDate?: string;       // ISO date of last weigh-in
  
  // Calculated Fields
  bmi?: number;                   // Body Mass Index
  goalBmi?: number;               // Target BMI
  daysToGoal?: number;            // Days remaining to goal date
  weeklyWeightChange?: number;    // lbs per week needed
  dailyCalorieAdjustment?: number; // Dietary adjustment from maintenance
  
  // Macro Goals (auto-calculated)
  dailyCalorieGoal?: number;
  dailyProteinGoal?: number;
  dailyCarbsGoal?: number;
  dailyFatGoal?: number;
  
  // Blood Panel Data
  bloodPanel?: {
    uploadDate: string;
    rawText: string;
    extractedValues: {
      [key: string]: number | string; // e.g., "Total Cholesterol": 210
    };
  };
  
  // Metadata
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface WeightEntry {
  date: string;           // ISO format (YYYY-MM-DD)
  weightLbs: number;
  notes?: string;
}
```

**Macro Calculation:**
- Uses Mifflin-St Jeor equation for BMR calculation
- Applies 1.5x activity multiplier for maintenance calories
- Calculates daily calorie adjustment: `(weeklyWeightChange * 3500) / 7`
- Clamps adjustment to healthy range: -1000 to +500 cal/day

**Collection Path:** `users/{uid}/profile/settings`
**Unit System:** Imperial (feet/inches, pounds) by default, with metric option in UI

---

### 2. **Food Entries** (`users/{uid}/foodEntries/{entryId}`)
Daily food log entries with AI-identified nutrition data.

```typescript
interface FoodEntry {
  id: string;
  foodName: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  portionSizeGrams: number;
  imageUrl?: string | null;       // Uploaded to Firebase Storage
  createdAt: Timestamp;           // Includes time for chronological ordering
  profileId?: string;             // Links to user profile
}
```

**Storage:** 
- Image URL points to Firebase Storage at `gs://nutritrack-ai-94a87.firebasestorage.app/`
- Documents organized by user and creation date for queries

**Collection Path:** `users/{uid}/foodEntries/{entryId}`

---

## Firestore Schema Overview

### Collection Structure:
```
databases/
  ├── users/
  │   ├── {uid}/
  │   │   ├── profile/
  │   │   │   └── settings (UserProfile)
  │   │   │   └── bloodPanel (optional, detailed blood work)
  │   │   └── foodEntries/
  │   │       ├── {entryId1} (FoodEntry)
  │   │       ├── {entryId2} (FoodEntry)
  │   │       └── ...
  ├── public/
  │   └── [optional for public sharing]
```

### Security Rules (`firestore.rules`):
```
- Users can only read/write their own data: `users/{uid}/{document=**}`
- Public collection accessible to authenticated users
- Enforced via `request.auth.uid == uid`
```

---

## Component Structure

### Main Application Pages

#### **Dashboard** (`src/app/(app)/dashboard/page.tsx`)
- Daily nutrition summary with rings for macro breakdown
- Displays current day's food entries
- Shows progress toward calorie and macro goals
- Interactive meal cards with edit/delete actions
- Real-time Firestore data using `useCollection`

**Key Features:**
- Macro progress rings (circular progress indicators)
- DEFAULT_GOALS: 2000 cal, 150p, 250c, 65f
- Goal visual tracking system
- Quick meal editing interface

#### **Food Log** (`src/app/(app)/log/page.tsx`)
- Multi-mode food entry (camera, text, quick search)
- Image capture and processing
- AI-powered food identification
- Manual food search via USDA API
- Supports image formats: JPEG, PNG, GIF, WebP, HEIC, AVIF
- File size limits: 20MB max, 10MB for data URIs

**Modes:**
1. **Camera Mode** - Capture and analyze food photos
2. **Text Mode** - Describe food in text for AI analysis
3. **Quick Mode** - Search USDA food database

#### **History** (`src/app/(app)/history/page.tsx`)
- Calendar-based food entry browsing
- Date-based filtering with DayPicker component
- View and edit historical entries
- Delete functionality with confirmation
- Expandable entry details

#### **Settings** (`src/app/(app)/settings/page.tsx`)
- Profile setup and management
- Personal details: name, age, sex, height, weight
- Unit preferences (imperial/metric toggle)
- Goal weight and target date
- BMI calculations and macro goal auto-calculation
- Blood panel image upload and analysis

---

## UI Components

### Base Components (`src/components/ui/`)
- `button.tsx` - Styled button component
- `card.tsx` - Card container with header/content sections
- `input.tsx` - Form input field
- `label.tsx` - Form field labels
- `skeleton.tsx` - Loading state placeholders
- `sonner.tsx` - Toast notification system

### Custom Components
- `AuthGuard.tsx` - Route protection wrapper
- `bottom-nav.tsx` - Mobile navigation (fixed bottom nav)

### Design System
- **Framework:** Tailwind CSS + shadcn/ui patterns
- **Icons:** Lucide React (Camera, Utensils, Flame, TrendingUp, etc.)
- **Colors:** Semantic (green for positive, red for negative trends)
- **Layout:** Responsive, mobile-first design

---

## API Routes & Backend Functions

### 1. **`/api/identify-food`** (POST)
**Purpose:** AI-powered food identification from images
**Uses:** Gemini 2.5 Flash vision model

**Request:**
```typescript
{
  photoDataUri: "data:image/jpeg;base64,..."  // Base64 encoded image
}
```

**Response:**
```typescript
{
  foodName: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  portionSizeGrams: number;
}
```

**Features:**
- Converts uploaded files to compatible base64 data URIs
- Image optimization (max 10MB data URI size)
- Error handling for timeout and format issues
- Logs image metadata for debugging

---

### 2. **`/api/analyze-food-text`** (POST)
**Purpose:** Parse food descriptions from natural language text
**Uses:** Genkit AI (Gemini model)

**Request:**
```typescript
{
  foodDescription: string;  // e.g., "2 slices of pizza"
}
```

**Response:** Same as identify-food

---

### 3. **`/api/search-foods`** (GET)
**Purpose:** Search USDA food database
**External API:** USDA FDC API

**Request:**
```
GET /api/search-foods?q=chicken
```

**Response:**
```typescript
{
  foods: [
    {
      fdcId: number;
      foodName: string;
      brandOwner?: string;
      category: string;
      portionSizeGrams: 100;  // Default portion
      calories: number;
      proteinGrams: number;
      carbsGrams: number;
      fatGrams: number;
    }
  ]
}
```

**Nutrient Mapping:**
- 1008 = Energy (calories)
- 1003 = Protein
- 1005 = Carbohydrates
- 1004 = Total lipid (fat)

---

### 4. **`/api/analyze-nutrition`** (POST)
**Purpose:** Detailed nutrition analysis (specific functionality TBD from route file)

---

### 5. **`/api/analyze-blood-panel`** (POST)
**Purpose:** Extract and analyze blood test results from images
**Uses:** Gemini 2.5 Flash vision model

**Request:**
```typescript
FormData {
  file: File;  // Blood panel image/PDF
}
```

**Response:**
```typescript
{
  extractedValues: {
    [testName: string]: number | string;  // e.g., "Total Cholesterol": 210
  };
  summary: string;            // Overall health status
  concerns: string[];         // 2-3 health concerns
  recommendations: string[]; // 2-3 lifestyle recommendations
}
```

**Extracted Tests:** Total Cholesterol, HDL, LDL, Triglycerides, Glucose, WBC, RBC, Hemoglobin, Hematocrit, etc.

---

## Authentication & Context

### AuthContext (`src/context/AuthContext.tsx`)
**Manages:**
- User authentication state
- Sign up / sign in / sign out
- Google OAuth integration
- Error handling and display

**Features:**
- Auto-creates default user profile on signup
- Sets default macro goals on profile creation
- Stores profile at: `users/{uid}/profile/settings`

**Provided Methods:**
```typescript
signIn(email, password): Promise<void>
signUp(email, password, displayName?): Promise<void>
signInWithGoogle(): Promise<void>
logOut(): Promise<void>
clearError(): void
```

---

## Firebase Configuration

**Project:** `nutritrack-ai-94a87`
**Region Details:**
```typescript
{
  apiKey: "AIzaSyDsA3gB7QcHOs4NAXQ5JyXJzXnJ1IQpFSA",
  authDomain: "nutritrack-ai-94a87.firebaseapp.com",
  projectId: "nutritrack-ai-94a87",
  storageBucket: "nutritrack-ai-94a87.firebasestorage.app",
  messagingSenderId: "648917299813",
  appId: "1:648917299813:web:edd7adc65592f8e9e88c8c"
}
```

**Services Enabled:**
- Firebase Auth (Email/Password + Google OAuth)
- Firestore Database
- Firebase Storage (for food images)

---

## AI & ML Integration

### Genkit Setup (`src/ai/genkit.ts`)
```typescript
- Plugin: Google AI (@genkit-ai/google-genai)
- Model: Gemini 2.5 Flash (geminiModel)
- API Key: GOOGLE_AI_API_KEY from environment
```

### Genkit Flows (`src/ai/flows/`)
- `identify-food.ts` - Food recognition flow

### Key AI Capabilities:
1. **Vision Analysis** - Identify foods from photos
2. **Image OCR** - Extract text from blood panels
3. **Natural Language** - Parse food descriptions
4. **Medical Data Extraction** - Extract and categorize blood test values

---

## Utility Functions

### `calculateBMI(heightInches, weightLbs): number`
Formula: `(weight in lbs / (height in inches)²) × 703`

### `calculateMacroGoals(...)`
**Inputs:** age, sex, heightInches, currentWeightLbs, goalWeightLbs, goalWeightDate?

**Calculations:**
1. **BMR** using Mifflin-St Jeor equation:
   - Male: `10*weight_kg + 6.25*height_cm - 5*age + 5`
   - Female: `10*weight_kg + 6.25*height_cm - 5*age - 161`

2. **Maintenance Calories:** `BMR × 1.5` (moderate activity)

3. **Goal Calorie Adjustment:**
   - Days to goal: calculated from goalWeightDate
   - Weekly change: `weightDifference / weeksToGoal`
   - Daily adjustment: `(weeklyWeightChange * 3500) / 7`
   - Clamped: `-1000 to +500` calories

4. **Macro Breakdown:** Calculated from adjusted daily calories (default percentages assumed)

---

## Data Flow Summary

### Food Entry Flow:
```
User captures/inputs food
    ↓
API analyzes (vision or text)
    ↓
Extract nutrition data (foodName, calories, macros)
    ↓
User confirms details
    ↓
Upload image to Firebase Storage
    ↓
Save FoodEntry to Firestore (users/{uid}/foodEntries/)
    ↓
Display in Dashboard with updated daily totals
```

### Profile Setup Flow:
```
User signs up
    ↓
AuthContext creates default profile
    ↓
User enters personal details in Settings
    ↓
System calculates BMI and macro goals
    ↓
Save to Firestore (users/{uid}/profile/settings)
    ↓
Display on Dashboard with personalized goals
```

### Blood Panel Flow:
```
User uploads blood panel image
    ↓
Gemini extracts all test values
    ↓
Displays extracted values, concerns, recommendations
    ↓
Optional: Save to userData.bloodPanel
```

---

## Key Features & Pages

| Page | Path | Features |
|------|------|----------|
| **Dashboard** | `/(app)/dashboard` | Daily macro rings, food log, goal progress |
| **Food Log** | `/(app)/log` | Camera/text/search food entry |
| **History** | `/(app)/history` | Calendar-based entry browsing |
| **Settings** | `/(app)/settings` | Profile setup, goal management, blood panel |
| **Login** | `/(auth)/login` | Email/password + Google OAuth |
| **Signup** | `/(auth)/signup` | Create new account |

---

## Environment Variables Required

```env
GOOGLE_AI_API_KEY=<Genkit API key>
NEXT_PUBLIC_FIREBASE_*=<Firebase config values>
```

---

## Performance & UI Patterns

### Real-time Updates
- Uses `react-firebase-hooks` for live data syncing
- `useCollection` for QuerySnapshot updates
- `useCollectionData` for document array queries

### Loading States
- Skeleton components for content placeholders
- Loader2 spinner icons for async operations
- Optimistic UI updates where applicable

### Error Handling
- Toast notifications via Sonner
- Detailed error messages in console
- User-friendly error displays in UI

### Responsive Design
- Mobile-first Tailwind approach
- Bottom navigation for mobile (bottom-nav component)
- Touch-friendly button sizing
- Image optimization with Next.js Image component

---

## Database Limits & Considerations

- **Firestore reads:** Auto-optimized by `react-firebase-hooks`
- **Image storage:** Firebase Storage with public read access via signed URLs
- **Real-time queries:** Limited by concurrent connections
- **Daily quotas:** Consider with high user load

---

## Future Enhancement Opportunities

1. **Analytics Dashboard** - Trends, weight loss graphs, macro adherence
2. **Meal Planning** - Weekly meal prep suggestions
3. **Community Features** - Recipe sharing, challenges
4. **Wearable Integration** - Apple Health, Google Fit sync
5. **Notifications** - Water reminders, meal time alerts
6. **Export** - PDF reports, data export
7. **Multi-profile** - Support for family members
8. **Offline Mode** - Service worker caching
