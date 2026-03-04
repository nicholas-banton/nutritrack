const { readFileSync } = require('fs');
const { join } = require('path');

// Load environment
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const apiKey = envContent.match(/NEXT_PUBLIC_FIREBASE_API_KEY=(.+)/)?.[1];
const projectId = envContent.match(/NEXT_PUBLIC_FIREBASE_PROJECT_ID=(.+)/)?.[1];
const databaseUrl = `https://${projectId}.firebaseio.com`;

// Check user
async function checkUser() {
  try {
    const email = 'marie.white926@gmail.com';
    
    console.log('🔍 Looking up user:', email);
    console.log('Using API Key:', apiKey.substring(0, 10) + '...');
    console.log('Project ID:', projectId);
    
    // Get the user's UID by searching Firebase Auth
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
    
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    });

    const data = await response.json();
    
    if (!response.ok || !data.users || data.users.length === 0) {
      console.log('❌ User not found in Firebase Auth');
      console.log('Response:', data);
      process.exit(1);
    }

    const uid = data.users[0].localId;
    console.log('\n✅ Found user:');
    console.log('  UID:', uid);
    console.log('  Email:', data.users[0].email);
    console.log('  Account created:', new Date(parseInt(data.users[0].createdAt)).toISOString());
    
    // Now check Firestore for profile data
    console.log('\n📋 Checking Firestore for profile data...\n');
    
    // Check main profile
    const mainProfileUrl = `${databaseUrl}/users/${uid}/profile/settings.json?auth=${apiKey}`;
    console.log('Fetching from:', mainProfileUrl.replace(apiKey, 'KEY***'));
    
    const profileResponse = await fetch(mainProfileUrl);
    const profileData = await profileResponse.json();
    
    if (profileData === null) {
      console.log('❌ Main Profile: No data saved');
    } else {
      console.log('✅ Main Profile data found:');
      console.log(JSON.stringify(profileData, null, 2));
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUser();
