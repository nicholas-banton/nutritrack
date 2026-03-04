async function addUser() {
  try {
    const email = 'marie.white926@gmail.com';
    const password = 'Test123*';
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    if (!apiKey) {
      console.error('❌ Error: NEXT_PUBLIC_FIREBASE_API_KEY not found in environment');
      process.exit(1);
    }

    // Create user via Firebase REST API
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
    
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: password,
        returnSecureToken: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to create user');
    }

    const uid = data.localId;

    console.log('✅ User created successfully:');
    console.log('Email:', email);
    console.log('UID:', uid);
    console.log('\nCredentials:');
    console.log('  Email: ' + email);
    console.log('  Password: Test123*');
    console.log('\nUser can now log in and complete their profile!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    process.exit(1);
  }
}

addUser();
