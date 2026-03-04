const { readFileSync } =  require('fs');
const { join } = require('path');

// Load environment
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const apiKey = envContent.match(/NEXT_PUBLIC_FIREBASE_API_KEY=(.+)/)?.[1];  
const projectId = envContent.match(/NEXT_PUBLIC_FIREBASE_PROJECT_ID=(.+)/)?.[1];

async function setupMarieProfile() {
  try {
    const email = 'marie.white926@gmail.com';
    const password = 'Test123*';
    
    console.log('1️⃣ Authenticating as Marie...');
    
    // Sign in to get ID token
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const signInRes = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    
    const signInData = await signInRes.json();
    
    if (!signInRes.ok) {
      console.error('❌ Auth failed:', signInData.error?.message);
      process.exit(1);
    }

    const uid = signInData.localId;
    const idToken = signInData.idToken;
    
    console.log('✅ Authenticated. UID:', uid);
    console.log('\n2️⃣ Creating profile document...');
    
    // Use a simpler POST to create the document
    const docPath = `projects/${projectId}/databases/(default)/documents/users/${uid}/profile`;
    const createUrl = `https://firestore.googleapis.com/v1/${docPath}`;
    
    const profileDoc = {
      fields: {
        name: { stringValue: 'Marie White' },
        age: { integerValue: '30' },
        sex: { stringValue: 'female' },
        heightInches: { doubleValue: 66 },
        currentWeightLbs: { doubleValue: 160 },
        goalWeightLbs: { doubleValue: 145 },
        dailyCalorieGoal: { integerValue: '2000' },
        dailyProteinGoal: { integerValue: '150' },
        dailyCarbsGoal: { integerValue: '225' },
        dailyFatGoal: { integerValue: '65' },
        bmi: { doubleValue: 25.9 },
        goalBmi: { doubleValue: 23.5 },
        createdAt: { timestampValue: new Date().toISOString() },
        updatedAt: { timestampValue: new Date().toISOString() },
      }
    };
    
    const createRes = await fetch(`${createUrl}?documentId=settings`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(profileDoc),
    });
    
    const responseText = await createRes.text();
    
    try {
      const responseData = JSON.parse(responseText);
      if (!createRes.ok) {
        console.error('❌ Save failed:', responseData);
        process.exit(1);
      }
      console.log('✅ Profile created!');
    } catch {
      console.error('❌ Unexpected response:', responseText);
      process.exit(1);
    }
    
    console.log('\n✨ Marie is all set! She can now log in and visit the dashboard.');
    console.log('\nCredentials:');
    console.log('  Email: marie.white926@gmail.com');
    console.log('  Password: Test123*');
    console.log('  UID:', uid);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupMarieProfile();
