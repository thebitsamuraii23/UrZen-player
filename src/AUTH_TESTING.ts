// @ts-nocheck
/**
 * Authentication Testing & Demo
 * Run these in the browser console to test the auth system
 * 
 * Note: Make sure the backend server is running!
 */

// ============================================
// TEST UTILITIES
// ============================================

const TEST_API_URL = 'http://localhost:3001';

/**
 * Pretty print API responses
 */
function prettyPrint(title, data) {
  console.group(`✅ ${title}`);
  console.table(data);
  console.groupEnd();
}

/**
 * Pretty print errors
 */
function prettyError(title, error) {
  console.group(`❌ ${title}`);
  console.error(error);
  console.groupEnd();
}

// ============================================
// AUTH SYSTEM TESTS
// ============================================

/**
 * Test 1: Check if server is running
 */
async function testServerHealth() {
  try {
    const response = await fetch(`${TEST_API_URL}/health`);
    const data = await response.json();
    prettyPrint('Server Health Check', data);
    return true;
  } catch (error) {
    prettyError('Server Health Check', error);
    return false;
  }
}

/**
 * Test 2: Register new user
 */
async function testRegister(username, password) {
  try {
    const response = await fetch(`${TEST_API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    prettyPrint(`Register ${username}`, data);
    return data;
  } catch (error) {
    prettyError(`Register ${username}`, error);
  }
}

/**
 * Test 3: Login with credentials
 */
async function testLogin(username, password) {
  try {
    const response = await fetch(`${TEST_API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    
    if (data.token) {
      console.log(`🔐 JWT Token: ${data.token.substring(0, 20)}...`);
      localStorage.setItem('test_token', data.token);
    }
    
    prettyPrint(`Login ${username}`, {
      message: data.message,
      username: data.username,
      token_length: data.token?.length || 0
    });
    return data;
  } catch (error) {
    prettyError(`Login ${username}`, error);
  }
}

/**
 * Test 4: Verify token
 */
async function testVerifyToken(token) {
  try {
    const response = await fetch(`${TEST_API_URL}/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await response.json();
    prettyPrint('Token Verification', data);
    return data.valid;
  } catch (error) {
    prettyError('Token Verification', error);
  }
}

/**
 * Test 5: Get current stored token
 */
function testGetStoredToken() {
  const token = localStorage.getItem('auth_token');
  const username = localStorage.getItem('auth_username');
  
  console.group('📦 Stored Auth Data');
  console.log('Username:', username || '(none)');
  console.log('Token:', token ? `${token.substring(0, 20)}...` : '(none)');
  console.groupEnd();
  
  return { token, username };
}

/**
 * Test 6: Clear all auth data
 */
function testClearAuth() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_username');
  localStorage.removeItem('test_token');
  console.log('✅ Cleared all authentication data');
}

// ============================================
// FRONTEND UI TESTS
// ============================================

/**
 * Test 7: Check if login panel exists
 */
function testLoginPanelUI() {
  const authPanel = document.getElementById('authPanel');
  const userInfo = document.getElementById('userInfo');
  const usernameInput = document.getElementById('authUsername');
  const passwordInput = document.getElementById('authPassword');
  const loginBtn = document.getElementById('authLoginBtn');
  const registerBtn = document.getElementById('authRegisterBtn');
  
  console.group('🎨 Login Panel UI Elements');
  console.log('Auth Panel:', authPanel ? '✅' : '❌');
  console.log('User Info Panel:', userInfo ? '✅' : '❌');
  console.log('Username Input:', usernameInput ? '✅' : '❌');
  console.log('Password Input:', passwordInput ? '✅' : '❌');
  console.log('Login Button:', loginBtn ? '✅' : '❌');
  console.log('Register Button:', registerBtn ? '✅' : '❌');
  console.groupEnd();
  
  return !!(authPanel && userInfo && usernameInput && passwordInput && loginBtn && registerBtn);
}

/**
 * Test 8: Set input values and trigger login
 */
function testSetInputsAndLogin(username, password) {
  const usernameInput = document.getElementById('authUsername');
  const passwordInput = document.getElementById('authPassword');
  
  if (usernameInput && passwordInput) {
    usernameInput.value = username;
    passwordInput.value = password;
    console.log(`✅ Filled inputs: ${username} / ${password}`);
    console.log('ℹ️  Call window.handleLogin() to trigger login');
  } else {
    console.error('❌ Could not find input elements');
  }
}

/**
 * Test 9: Check CSS loaded
 */
function testCSSLoaded() {
  const authPanel = document.getElementById('authPanel');
  if (!authPanel) {
    console.error('❌ Auth panel not found in DOM');
    return false;
  }
  
  const styles = window.getComputedStyle(authPanel);
  const hasBackdropFilter = styles.backdropFilter !== 'none';
  
  console.group('🎨 CSS Styling');
  console.log('Auth panel exists: ✅');
  console.log('Has backdrop-filter:', hasBackdropFilter ? '✅' : '⚠️');
  console.log('Background color:', styles.backgroundColor);
  console.log('Border:', styles.border);
  console.groupEnd();
  
  return true;
}

// ============================================
// COMPLETE DEMO FLOWS
// ============================================

/**
 * Full Demo 1: Complete Registration & Login Flow
 */
async function demoCompleteFlow() {
  console.log('🚀 Starting Complete Auth Flow Demo...\n');
  
  const username = `testuser_${Date.now()}`;
  const password = 'TestPassword123';
  
  // Step 1: Check server
  console.log('Step 1: Checking server health...');
  const serverOk = await testServerHealth();
  if (!serverOk) {
    console.error('❌ Server is not running!');
    return;
  }
  
  // Step 2: Check UI
  console.log('\nStep 2: Checking login panel UI...');
  const uiOk = testLoginPanelUI();
  if (!uiOk) {
    console.error('❌ Login panel UI not found!');
    return;
  }
  
  // Step 3: Register
  console.log(`\nStep 3: Registering new user: ${username}`);
  const regResult = await testRegister(username, password);
  if (!regResult) {
    console.error('❌ Registration failed!');
    return;
  }
  
  // Step 4: Login
  console.log(`\nStep 4: Logging in as ${username}`);
  const loginResult = await testLogin(username, password);
  if (!loginResult || !loginResult.token) {
    console.error('❌ Login failed!');
    return;
  }
  
  // Step 5: Verify token
  console.log('\nStep 5: Verifying token...');
  const isValid = await testVerifyToken(loginResult.token);
  if (!isValid) {
    console.error('❌ Token verification failed!');
    return;
  }
  
  // Step 6: Check storage
  console.log('\nStep 6: Checking stored auth data...');
  testGetStoredToken();
  
  console.log('\n✅ Complete flow successful!');
}

/**
 * Full Demo 2: Test Frontend UI
 */
async function demoFrontendUI() {
  console.log('🎨 Frontend UI Demo\n');
  
  // Check CSS
  testCSSLoaded();
  
  // Create demo user
  const demoUser = `demouser_${Date.now()}`;
  const demoPass = 'DemoPassword123';
  
  console.log(`\n📝 Demo User Created: ${demoUser}`);
  console.log(`\n⚙️  Available Commands:`);
  console.log(`   • testSetInputsAndLogin('${demoUser}', '${demoPass}')`);
  console.log(`   • window.handleLogin() - Submit login`);
  console.log(`   • window.handleRegister() - Submit registration`);
  console.log(`   • window.handleLogout() - Logout user`);
}

/**
 * Full Demo 3: Manual testing guide
 */
function demoManualGuide() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║        Z BETA - Authentication System Testing Guide            ║
╚════════════════════════════════════════════════════════════════╝

🚀 QUICK START:
1. Make sure backend is running: npm start
2. Run this in console: demoCompleteFlow()

🧪 AVAILABLE TEST FUNCTIONS:

Authentication Tests:
  ├─ testServerHealth()                    - Check if server is running
  ├─ testRegister('user', 'pass')         - Test registration
  ├─ testLogin('user', 'pass')            - Test login
  ├─ testVerifyToken(token)               - Verify JWT token
  ├─ testGetStoredToken()                 - Show stored auth data
  └─ testClearAuth()                      - Clear localStorage

UI Tests:
  ├─ testLoginPanelUI()                   - Check all UI elements
  ├─ testSetInputsAndLogin('u', 'p')     - Fill inputs
  └─ testCSSLoaded()                      - Check CSS styling

Complete Demos:
  ├─ demoCompleteFlow()                   - Full registration+login
  ├─ demoFrontendUI()                     - Frontend UI walkthrough
  └─ demoManualGuide()                    - This help message

UI Functions (call directly):
  ├─ window.handleLogin()                 - Submit login form
  ├─ window.handleRegister()              - Submit register form
  └─ window.handleLogout()                - Logout user

📦 STORED DATA:
  ├─ localStorage.getItem('auth_token')      - JWT token
  ├─ localStorage.getItem('auth_username')   - Current username
  └─ testClearAuth()                         - Clear all data

🔍 DEBUGGING:
  • Check browser console errors (F12)
  • Verify server: http://localhost:3001/health
  • View stored data: testGetStoredToken()
  • Clear data if needed: testClearAuth()

📚 DOCUMENTATION:
  • QUICKSTART.md - 5-minute setup guide
  • AUTH_SETUP.md - Complete configuration guide
  • js/navidrome-integration.ts - Navidrome API examples

  `);
}

// ============================================
// QUICK REFERENCE
// ============================================

console.log(`
✨ Z BETA Authentication System Ready!

Run these in the console:
  → demoCompleteFlow()    - Full test demo
  → demoFrontendUI()      - UI walkthrough
  → demoManualGuide()     - Full help menu

Type "help()" for more info.
`);

// Add help function
window.authTestHelp = demoManualGuide;
window.help = demoManualGuide;
