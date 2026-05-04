/* =============================================
   SMARTBITE — app.js  (Firebase Edition)
   ============================================= */

import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics }                           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut,
         onAuthStateChanged }                     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc,
         collection, addDoc, getDocs,
         deleteDoc, query, orderBy }              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---- Firebase Config ----
const firebaseConfig = {
  apiKey:            "AIzaSyANwVw-0M0P3i9WsgVAfVY5eefJRjl2RCA",
  authDomain:        "smbite12.firebaseapp.com",
  databaseURL:       "https://smbite12-default-rtdb.firebaseio.com",
  projectId:         "smbite12",
  storageBucket:     "smbite12.firebasestorage.app",
  messagingSenderId: "1067643957020",
  appId:             "1:1067643957020:web:d9de2191fceaa7b5bad4d9",
  measurementId:     "G-FXGRYQSRF1"
};

const firebaseApp = initializeApp(firebaseConfig);
const analytics   = getAnalytics(firebaseApp);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);

// ---- EmailJS Config ----
const EMAILJS_SERVICE_ID  = 'service_xi0um8w';
const EMAILJS_TEMPLATE_ID = 'template_brnx7yj';
const EMAILJS_PUBLIC_KEY  = 'koTFYwKltn5wUm99V';

// ---- Global State ----
let USER        = null;
let FOOD_LOG    = [];
let PENDING_OTP = null;

// =============================================================================
// UTILITIES
// =============================================================================

function getInitials(u) {
  return ((u.fname || '?')[0] + (u.lname || '')[0]).toUpperCase();
}

function showToast(msg, dur = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

function calcBMI(h, w) {
  return (w / ((h / 100) ** 2)).toFixed(1);
}

function getBMICat(b) {
  b = parseFloat(b);
  if (b < 18.5) return 'Underweight';
  if (b < 25)   return 'Normal Weight';
  if (b < 30)   return 'Overweight';
  return 'Obese';
}

function calcCalTarget(age, gender, h, w, goal) {
  let bmr = gender === 'female'
    ? (10 * w) + (6.25 * h) - (5 * age) - 161
    : (10 * w) + (6.25 * h) - (5 * age) + 5;
  let tdee = bmr * 1.4;
  if (goal === 'lose')  tdee -= 500;
  if (goal === 'gain')  tdee += 300;
  return Math.round(tdee);
}

function calcStreak() {
  if (!FOOD_LOG.length) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d  = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    if (FOOD_LOG.some(f => new Date(f.date).toDateString() === ds)) streak++;
    else break;
  }
  return streak;
}

function generateOTPCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// =============================================================================
// PASSWORD UI HELPERS
// =============================================================================

function checkPassStrength() {
  const pass = document.getElementById('reg-pass').value;
  const bar  = document.getElementById('pass-bar');
  const hint = document.getElementById('pass-hint');
  let strength = 0;
  if (pass.length >= 6)            strength++;
  if (pass.length >= 10)           strength++;
  if (/[A-Z]/.test(pass))         strength++;
  if (/[0-9]/.test(pass))         strength++;
  if (/[^A-Za-z0-9]/.test(pass))  strength++;

  const levels = [
    { w: '0%',   bg: 'transparent', text: '' },
    { w: '25%',  bg: '#E63946',     text: 'Weak' },
    { w: '50%',  bg: '#F9C74F',     text: 'Fair' },
    { w: '75%',  bg: '#52B788',     text: 'Good' },
    { w: '100%', bg: '#2D6A4F',     text: 'Strong' },
  ];
  const lvl = Math.min(strength, 4);
  bar.style.width      = levels[lvl].w;
  bar.style.background = levels[lvl].bg;
  hint.textContent     = levels[lvl].text;
  hint.style.color     = levels[lvl].bg;
  checkPassMatch();
}

function checkPassMatch() {
  const pass    = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-pass-confirm').value;
  const hint    = document.getElementById('pass-match-hint');
  if (!confirm) { hint.textContent = ''; return; }
  if (pass === confirm) {
    hint.textContent = '✓ Passwords match';
    hint.style.color = '#52B788';
  } else {
    hint.textContent = '✗ Passwords do not match';
    hint.style.color = '#E63946';
  }
}

// =============================================================================
// TERMS MODAL
// =============================================================================

function openTerms() {
  document.getElementById('terms-modal').style.display = 'flex';
}

function closeTerms() {
  document.getElementById('terms-modal').style.display = 'none';
}

function acceptTerms() {
  document.getElementById('reg-terms').checked = true;
  closeTerms();
  showToast('Terms accepted ✓');
}

// =============================================================================
// OTP FLOW
// =============================================================================

function openOTP(email) {
  document.getElementById('otp-email-display').textContent = email;
  document.getElementById('otp-error').textContent = '';
  for (let i = 1; i <= 6; i++) document.getElementById('otp-' + i).value = '';
  document.getElementById('otp-screen').style.display = 'flex';
  document.getElementById('otp-1').focus();
}

function closeOTP() {
  document.getElementById('otp-screen').style.display = 'none';
  PENDING_OTP = null;
}

function otpMove(el, idx) {
  el.value = el.value.replace(/\D/g, '');
  if (el.value && idx < 6) document.getElementById('otp-' + (idx + 1)).focus();
  const all = Array.from({length: 6}, (_, i) => document.getElementById('otp-' + (i + 1)).value);
  if (all.every(v => v)) verifyOTP();
}

function otpBack(e, idx) {
  if (e.key === 'Backspace' && !e.target.value && idx > 1)
    document.getElementById('otp-' + (idx - 1)).focus();
}

async function sendOTPEmail(email, name, code) {
  // ✅ Variable names match the EmailJS template EXACTLY:
  //    {{to_name}}  → user's first name
  //    {{otp_code}} → the 6-digit code
  //    To Email field in template must be set to {{to_email}}
  emailjs.init(EMAILJS_PUBLIC_KEY);
  await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email: email,   // → goes to the "To Email" field in EmailJS template
    to_name:  name,    // → {{to_name}} in template body
    otp_code: code,    // → {{otp_code}} in template body
  });
}

async function resendOTP() {
  if (!PENDING_OTP) return;
  const newCode = generateOTPCode();
  PENDING_OTP.code    = newCode;
  PENDING_OTP.expires = Date.now() + 10 * 60 * 1000;
  document.getElementById('otp-error').textContent = '';
  for (let i = 1; i <= 6; i++) document.getElementById('otp-' + i).value = '';
  document.getElementById('otp-1').focus();
  try {
    await sendOTPEmail(PENDING_OTP.email, PENDING_OTP.profile.fname, newCode);
    showToast('A new code has been sent to your email!');
  } catch (err) {
    showToast('Failed to resend. Check your connection.');
    console.error('Resend OTP error:', err);
  }
}

async function verifyOTP() {
  if (!PENDING_OTP) return;
  const entered = Array.from({length: 6}, (_, i) =>
    document.getElementById('otp-' + (i + 1)).value
  ).join('');

  const errEl = document.getElementById('otp-error');
  if (entered.length < 6) { errEl.textContent = 'Please enter all 6 digits.'; return; }
  if (Date.now() > PENDING_OTP.expires) {
    errEl.textContent = 'This code has expired. Please request a new one.'; return;
  }
  if (entered !== PENDING_OTP.code) {
    errEl.textContent = 'Incorrect code. Please try again.';
    for (let i = 1; i <= 6; i++) document.getElementById('otp-' + i).value = '';
    document.getElementById('otp-1').focus();
    return;
  }

  errEl.textContent = '';
  try {
    const cred = await createUserWithEmailAndPassword(
      auth, PENDING_OTP.email, PENDING_OTP.password
    );
    await saveUserProfile(cred.user.uid, PENDING_OTP.profile);
    const fname = PENDING_OTP.profile.fname;
    PENDING_OTP = null;
    document.getElementById('otp-screen').style.display = 'none';
    showToast('Account verified! Welcome, ' + fname + '! 🎉');
  } catch (err) {
    errEl.textContent = 'Account creation failed: ' + err.message;
  }
}

// =============================================================================
// FIRESTORE HELPERS
// =============================================================================

async function saveUserProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), data, { merge: true });
}

async function fetchUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

async function addFoodEntry(entry) {
  const ref = await addDoc(collection(db, 'users', auth.currentUser.uid, 'foodLog'), entry);
  return ref.id;
}

async function fetchFoodLog(uid) {
  const q    = query(collection(db, 'users', uid, 'foodLog'), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
}

async function deleteFoodEntry(firestoreId) {
  await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'foodLog', firestoreId));
}

// =============================================================================
// AUTH
// =============================================================================

onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    USER     = await fetchUserProfile(firebaseUser.uid);
    FOOD_LOG = await fetchFoodLog(firebaseUser.uid);
    enterApp();
  } else {
    USER     = null;
    FOOD_LOG = [];
    document.getElementById('app-screen').style.display  = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
  }
});

function switchTab(tab) {
  const tabs  = document.querySelectorAll('.auth-tab');
  const login = document.getElementById('login-form');
  const reg   = document.getElementById('register-form');
  if (tab === 'login') {
    tabs[0].classList.add('active');    tabs[1].classList.remove('active');
    login.style.display = 'block';      reg.style.display = 'none';
  } else {
    tabs[0].classList.remove('active'); tabs[1].classList.add('active');
    login.style.display = 'none';       reg.style.display = 'block';
  }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { showToast('Please fill in all fields'); return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    showToast(err.code === 'auth/invalid-credential'
      ? 'Incorrect email or password'
      : 'Login failed: ' + err.message);
  }
}

async function doRegister() {
  const fname   = document.getElementById('reg-fname').value.trim();
  const lname   = document.getElementById('reg-lname').value.trim();
  const email   = document.getElementById('reg-email').value.trim();
  const pass    = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-pass-confirm').value;
  const age     = document.getElementById('reg-age').value;
  const gender  = document.getElementById('reg-gender').value;
  const height  = document.getElementById('reg-height').value;
  const weight  = document.getElementById('reg-weight').value;
  const goal    = document.getElementById('reg-goal').value;
  const termsOk = document.getElementById('reg-terms').checked;

  if (!fname || !email || !pass || !confirm || !age || !gender || !height || !weight) {
    showToast('Please fill in all fields'); return;
  }
  if (pass.length < 6)   { showToast('Password must be at least 6 characters'); return; }
  if (pass !== confirm)  { showToast('Passwords do not match'); return; }
  if (!termsOk)          { showToast('Please agree to the Terms of Service to continue'); return; }

  const code = generateOTPCode();
  PENDING_OTP = {
    code,
    email,
    password: pass,
    expires:  Date.now() + 10 * 60 * 1000,
    profile: {
      fname, lname, email,
      age: +age, gender, height: +height, weight: +weight, goal,
      cals: calcCalTarget(+age, gender, +height, +weight, goal),
      agreedToTerms: true,
      createdAt: new Date().toISOString()
    }
  };

  try {
    showToast('Sending verification code…');
    await sendOTPEmail(email, fname, code);
    openOTP(email);
  } catch (err) {
    console.error('EmailJS error:', err);
    showToast('Failed to send verification email. Please try again.');
    PENDING_OTP = null;
  }
}

async function doLogout() {
  await signOut(auth);
  USER     = null;
  FOOD_LOG = [];
  document.getElementById('app-screen').style.display  = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  showToast('Logged out successfully');
}

// =============================================================================
// APP INIT
// =============================================================================

function enterApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'flex';
  const init = getInitials(USER);
  document.getElementById('nav-avatar').textContent  = init;
  document.getElementById('prof-avatar').textContent = init;
  updateDashboard();
  loadProfileForm();
}

function showPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(x => {
    if (x.getAttribute('onclick') && x.getAttribute('onclick').includes("'" + p + "'"))
      x.classList.add('active');
  });
  if (p === 'dashboard')       updateDashboard();
  if (p === 'recommendations') { loadGoalBars(); generateWeeklyInsights(); renderNutritionTips(); }
  if (p === 'log')             renderLogEntries();
}

// =============================================================================
// DASHBOARD
// =============================================================================

function updateDashboard() {
  if (!USER) return;

  const bmi = calcBMI(USER.height, USER.weight);
  const cat = getBMICat(+bmi);
  document.getElementById('dash-bmi').textContent     = bmi;
  document.getElementById('dash-bmi-cat').textContent = cat;
  const notes = {
    'Normal Weight': 'Great shape! Keep it up.',
    'Underweight':   'Consider increasing caloric intake.',
    'Overweight':    'A healthy diet can help.',
    'Obese':         'Consult a healthcare provider.'
  };
  document.getElementById('dash-bmi-note').textContent = notes[cat] || '';

  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting').textContent = greet + ', ' + USER.fname + '!';
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const today     = new Date().toDateString();
  const todayLogs = FOOD_LOG.filter(f => new Date(f.date).toDateString() === today);
  const totalCals = todayLogs.reduce((s, f) => s + f.calories, 0);
  const target    = USER.cals || 2000;
  document.getElementById('dash-cals-today').textContent = totalCals;
  document.getElementById('dash-cals-goal').textContent  = '/ ' + target + ' kcal goal';
  document.getElementById('dash-cal-bar').style.width    = Math.min(100, (totalCals / target) * 100) + '%';

  document.getElementById('s-foods').textContent    = todayLogs.length;
  document.getElementById('sp-foods').style.width   = Math.min(100, todayLogs.length * 15) + '%';

  const healthyCount = todayLogs.filter(f => f.rating === 'healthy').length;
  const healthyRatio = todayLogs.length > 0 ? Math.round((healthyCount / todayLogs.length) * 100) : 0;
  document.getElementById('s-healthy').textContent  = healthyRatio + '%';
  document.getElementById('sp-healthy').style.width = healthyRatio + '%';

  const streak = calcStreak();
  document.getElementById('s-streak').textContent  = streak;
  document.getElementById('sp-streak').style.width = Math.min(100, streak * 14) + '%';

  const recent = document.getElementById('dash-recent');
  if (todayLogs.length === 0) {
    recent.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🥦</div><div>No meals logged today</div></div>`;
  } else {
    recent.innerHTML = todayLogs.slice(-6).reverse().map(f => `
      <div class="food-chip">
        <div class="food-dot" style="background:${f.rating==='healthy'?'#52B788':f.rating==='unhealthy'?'#E63946':'#F9C74F'}"></div>
        <div>
          <div class="food-chip-name">${f.name}</div>
          <div class="food-chip-cal">${f.calories} kcal · ${f.meal}</div>
        </div>
      </div>`).join('');
  }

  const tips = generateTips(todayLogs, totalCals, target, +bmi);
  document.getElementById('dash-recos').innerHTML = tips.map(t => `
    <div class="reco-card">
      <div class="reco-icon">${t.icon}</div>
      <div class="reco-text"><strong>${t.title}</strong>${t.msg}</div>
    </div>`).join('');

  document.getElementById('prof-bmi').textContent   = bmi;
  document.getElementById('prof-wt').textContent    = USER.weight;
  document.getElementById('prof-ht').textContent    = USER.height;
  document.getElementById('prof-name').textContent  = USER.fname + ' ' + USER.lname;
  document.getElementById('prof-email').textContent = USER.email;
}

function generateTips(logs, cals, target, bmi) {
  const tips = [];
  if (logs.length === 0)
    tips.push({ icon: '🍳', title: 'Start Your Day Right', msg: 'Log your first meal to get personalized nutrition insights and recommendations.' });
  if (cals > target * 1.1)
    tips.push({ icon: '⚠️', title: 'Calorie Alert', msg: `You've consumed ${cals} kcal — ${cals - target} over your ${target} kcal goal. Consider lighter options for your next meal.` });
  if (cals < target * 0.5 && logs.length > 0)
    tips.push({ icon: '🥑', title: 'Fuel Up', msg: `You're only at ${cals} kcal. Make sure to meet your ${target} kcal daily goal.` });
  if (logs.filter(f => f.rating === 'unhealthy').length > 0)
    tips.push({ icon: '🥗', title: 'Balance Your Plate', msg: "You've logged some less healthy options. Try pairing with vegetables or whole grains." });
  if (bmi > 25)
    tips.push({ icon: '🚶', title: 'Stay Active', msg: 'Combine nutrition tracking with regular physical activity. Even a 30-minute walk helps!' });
  if (bmi < 18.5)
    tips.push({ icon: '🍚', title: 'Increase Intake', msg: 'Your BMI suggests you may benefit from more calorie-dense foods like nuts, legumes, and whole grains.' });
  if (tips.length === 0)
    tips.push({ icon: '🌟', title: 'Great Job!', msg: "You're on track today! Keep logging your meals consistently for the best insights." });
  return tips.slice(0, 3);
}

// =============================================================================
// FOOD LOG
// =============================================================================

async function logFood() {
  const name = document.getElementById('food-name').value.trim();
  const cal  = parseInt(document.getElementById('food-cal').value) || 0;
  const meal = document.getElementById('food-meal').value;
  if (!name) { showToast('Please enter a food name'); return; }

  const area = document.getElementById('analysis-area');
  area.style.display = 'block';
  document.getElementById('analysis-loading').style.display = 'flex';
  document.getElementById('analysis-result').style.display  = 'none';

  let rating = 'moderate', resultHTML = '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are a nutrition expert. Analyze the food item and return ONLY valid JSON with no markdown fences or extra text: {"rating":"healthy"|"moderate"|"unhealthy","calories_estimate":number,"analysis":"2-sentence analysis","nutrients":["nutrient 1","nutrient 2","nutrient 3"],"tip":"one short actionable tip"}`,
        messages: [{ role: 'user', content: `Food: ${name}. User logged ${cal || 'unknown'} calories. User goal: ${USER?.goal || 'healthy eating'}.` }]
      })
    });
    const data        = await res.json();
    const text        = data.content.map(i => i.text || '').join('');
    const clean       = text.replace(/```json|```/g, '').trim();
    const parsed      = JSON.parse(clean);
    rating            = parsed.rating || 'moderate';
    const finalCal    = cal || parsed.calories_estimate || 200;
    const badgeClass  = rating === 'healthy' ? 'badge-healthy' : rating === 'unhealthy' ? 'badge-unhealthy' : 'badge-moderate';
    const ratingLabel = rating.charAt(0).toUpperCase() + rating.slice(1);

    resultHTML = `
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.7rem">
        <span class="entry-badge ${badgeClass}" style="font-size:.8rem;padding:.3rem .8rem">${ratingLabel}</span>
        <span style="font-size:.82rem;color:var(--muted)">~${finalCal} kcal estimated</span>
      </div>
      <div style="margin-bottom:.6rem">${parsed.analysis}</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem">
        ${(parsed.nutrients || []).map(n =>
          `<span style="background:#F0FAF5;color:#1B4332;font-size:.75rem;padding:.22rem .65rem;border-radius:20px">${n}</span>`
        ).join('')}
      </div>
      <div style="font-size:.82rem;color:var(--orange);font-weight:500">💡 ${parsed.tip}</div>`;

    const entry = { name, calories: finalCal, meal, rating, date: new Date().toISOString(), analysis: parsed.analysis };
    const firestoreId = await addFoodEntry(entry);
    FOOD_LOG.push({ firestoreId, ...entry });

  } catch (err) {
    console.error('Analysis error:', err);
    const finalCal = cal || 200;
    resultHTML = `<div style="color:var(--muted);font-size:.85rem">AI analysis unavailable. Food logged with ${finalCal} calories.</div>`;
    const entry = { name, calories: finalCal, meal, rating: 'moderate', date: new Date().toISOString(), analysis: '' };
    const firestoreId = await addFoodEntry(entry);
    FOOD_LOG.push({ firestoreId, ...entry });
  }

  renderLogEntries();
  updateDashboard();
  document.getElementById('food-name').value = '';
  document.getElementById('food-cal').value  = '';
  showToast('Food logged successfully!');
  document.getElementById('analysis-loading').style.display = 'none';
  document.getElementById('analysis-result').style.display  = 'block';
  document.getElementById('analysis-result').innerHTML      = resultHTML;
}

function renderLogEntries() {
  const today     = new Date().toDateString();
  const todayLogs = FOOD_LOG.filter(f => new Date(f.date).toDateString() === today);
  const container = document.getElementById('log-entries');

  if (todayLogs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍽️</div>
        <div>No foods logged yet today</div>
        <div class="empty-hint">Add your first meal above</div>
      </div>`;
    return;
  }

  container.innerHTML = [...todayLogs].reverse().map(f => {
    const badgeClass = f.rating === 'healthy' ? 'badge-healthy' : f.rating === 'unhealthy' ? 'badge-unhealthy' : 'badge-moderate';
    return `
      <div class="log-entry">
        <span class="entry-meal meal-tag-${f.meal}">${f.meal}</span>
        <span class="entry-name">${f.name}</span>
        <span class="entry-cal">${f.calories} kcal</span>
        <span class="entry-badge ${badgeClass}">${f.rating}</span>
        <button onclick="window.deleteEntry('${f.firestoreId}')"
          style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:1rem;padding:.2rem .4rem;border-radius:6px"
          title="Delete">✕</button>
      </div>`;
  }).join('');
}

async function deleteEntry(firestoreId) {
  await deleteFoodEntry(firestoreId);
  FOOD_LOG = FOOD_LOG.filter(f => f.firestoreId !== firestoreId);
  renderLogEntries();
  updateDashboard();
  showToast('Entry removed');
}

// =============================================================================
// RECOMMENDATIONS
// =============================================================================

function loadGoalBars() {
  if (!USER) return;
  const today     = new Date().toDateString();
  const todayLogs = FOOD_LOG.filter(f => new Date(f.date).toDateString() === today);
  const totalCals = todayLogs.reduce((s, f) => s + f.calories, 0);
  const target    = USER.cals || 2000;
  const healthyPct = todayLogs.length > 0
    ? Math.round((todayLogs.filter(f => f.rating === 'healthy').length / todayLogs.length) * 100) : 0;

  const bars = [
    { label: 'Calories',      val: Math.min(100, Math.round(totalCals / target * 100)), detail: totalCals + ' / ' + target + ' kcal',       color: 'var(--green)' },
    { label: 'Healthy Foods', val: healthyPct,                                           detail: healthyPct + '% of logged items',            color: '#52B788'      },
    { label: 'Meals Logged',  val: Math.min(100, Math.round(todayLogs.length / 4 * 100)), detail: todayLogs.length + ' of 4 recommended',    color: 'var(--blue)'  },
  ];

  document.getElementById('goal-bars').innerHTML = bars.map(b => `
    <div class="goal-bar-row">
      <div class="goal-bar-meta">
        <span class="goal-bar-label">${b.label}</span>
        <span class="goal-bar-detail">${b.detail}</span>
      </div>
      <div class="goal-bar-track">
        <div class="goal-bar-fill" style="width:${b.val}%;background:${b.color}"></div>
      </div>
    </div>`).join('');
}

async function generateWeeklyInsights() {
  if (!USER) { document.getElementById('weekly-insights').textContent = 'Please log in.'; return; }
  const el = document.getElementById('weekly-insights');
  el.innerHTML = '<div class="analysis-loading"><div class="spinner"></div> Generating insights...</div>';

  const week    = FOOD_LOG.slice(-20);
  const summary = week.map(f => f.name + '(' + f.rating + ')').join(', ') || 'No recent logs';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'You are a friendly nutrition coach. Give 3 short, practical, personalized insights based on the user data. Use bullet points with emoji. Keep it under 120 words total.',
        messages: [{ role: 'user', content: `User: ${USER.fname}, goal: ${USER.goal}, BMI: ${calcBMI(USER.height, USER.weight)}, recent foods: ${summary}` }]
      })
    });
    const data = await res.json();
    const text = data.content.map(i => i.text || '').join('');
    el.innerHTML = text.replace(/\n/g, '<br>');
  } catch {
    el.textContent = 'Log more meals to see your weekly insights!';
  }
}

// =============================================================================
// NUTRITION TIPS
// =============================================================================

const TIPS_DATA = {
  lose: [
    { icon: '🥦', bg: '#D8F3DC', title: 'Create a sustainable calorie deficit', desc: 'Aim for 300–500 kcal below your TDEE daily. Drastic cuts slow your metabolism and cause muscle loss — gradual reduction preserves lean mass while burning fat.', tag: 'Weight Loss', tagBg: '#D8F3DC', tagColor: '#1B6B3A' },
    { icon: '🍗', bg: '#FFF3E0', title: 'High protein keeps hunger at bay', desc: 'Protein has the highest satiety value of all macronutrients. Target 1.2–1.6 g per kg of body weight daily using chicken breast, fish, eggs, or legumes.', tag: 'Macronutrients', tagBg: '#FFF3E0', tagColor: '#E65100' },
    { icon: '🌾', bg: '#F3E5F5', title: 'Swap refined carbs for whole grains', desc: 'Brown rice, oats, and quinoa digest slower, keeping blood sugar stable and hunger controlled for hours — unlike white bread or sugary cereals.', tag: 'Carbohydrates', tagBg: '#F3E5F5', tagColor: '#6A1B9A' },
    { icon: '💧', bg: '#E3F2FD', title: 'Drink water before every meal', desc: 'Studies show drinking 500 ml of water 30 minutes before meals reduces calorie intake by up to 13%. It also prevents mistaking thirst for hunger.', tag: 'Hydration', tagBg: '#E3F2FD', tagColor: '#1565C0' },
    { didYouKnow: true, fact: 'Eating slowly and mindfully can reduce your total calorie intake by up to 20%. It takes about 20 minutes for your brain to register fullness — so pause between bites.' }
  ],
  maintain: [
    { icon: '⚖️', bg: '#E8F5E9', title: 'Match energy in with energy out', desc: 'Maintenance is about balance, not perfection. Track your calories a few days per week to stay aware of your intake without obsessing over every meal.', tag: 'Energy Balance', tagBg: '#E8F5E9', tagColor: '#2E7D32' },
    { icon: '🥗', bg: '#D8F3DC', title: 'Eat a wide variety of whole foods', desc: 'A diverse diet ensures you get all essential vitamins and minerals. Aim to eat at least 30 different plant foods per week — vegetables, fruits, grains, legumes, nuts.', tag: 'Food Variety', tagBg: '#D8F3DC', tagColor: '#1B6B3A' },
    { icon: '🕗', bg: '#FFFDE7', title: 'Keep consistent meal timing', desc: 'Eating at regular intervals helps regulate hunger hormones (ghrelin and leptin), preventing the urge to overeat at any single sitting.', tag: 'Meal Timing', tagBg: '#FFFDE7', tagColor: '#F57F17' },
    { icon: '🧂', bg: '#FCE4EC', title: 'Limit ultra-processed food intake', desc: 'Ultra-processed foods are engineered to override your fullness signals. Keeping them below 20% of your diet reduces the risk of unintentional weight gain.', tag: 'Food Quality', tagBg: '#FCE4EC', tagColor: '#880E4F' },
    { didYouKnow: true, fact: 'Research shows people who weigh themselves regularly (once or twice a week) are significantly better at maintaining their weight long-term than those who avoid the scale.' }
  ],
  gain: [
    { icon: '🍚', bg: '#FFF3E0', title: 'Eat in a controlled calorie surplus', desc: 'Target 250–500 kcal above your TDEE daily. A slow bulk (0.25–0.5 kg/week) minimizes fat gain while maximizing lean muscle growth over time.', tag: 'Muscle Gain', tagBg: '#FFF3E0', tagColor: '#E65100' },
    { icon: '🥩', bg: '#D8F3DC', title: 'Prioritize protein around workouts', desc: 'Consume 25–40 g of high-quality protein within 2 hours of training. This maximizes muscle protein synthesis — the key driver of muscle hypertrophy.', tag: 'Performance', tagBg: '#D8F3DC', tagColor: '#1B6B3A' },
    { icon: '🥜', bg: '#F3E5F5', title: 'Add calorie-dense healthy foods', desc: 'Nuts, nut butters, avocado, olive oil, and whole milk are calorie-dense without excessive bulk — ideal for hitting your calorie targets without feeling overly full.', tag: 'Calorie Dense', tagBg: '#F3E5F5', tagColor: '#6A1B9A' },
    { icon: '😴', bg: '#E3F2FD', title: 'Sleep is when muscles are built', desc: 'Most muscle repair and growth happens during deep sleep. Aim for 7–9 hours per night. Poor sleep elevates cortisol, a hormone that actively breaks down muscle tissue.', tag: 'Recovery', tagBg: '#E3F2FD', tagColor: '#1565C0' },
    { didYouKnow: true, fact: 'Creatine monohydrate is the most researched sports supplement in history. Studies consistently show it increases strength and lean mass gains by 5–15% when combined with resistance training.' }
  ],
  healthy: [
    { icon: '🥦', bg: '#D8F3DC', title: 'Fill half your plate with vegetables', desc: 'Non-starchy vegetables are low in calories and rich in fiber, vitamins, and antioxidants. Aim for 5 servings per day across a range of colors for maximum micronutrient coverage.', tag: 'General Health', tagBg: '#D8F3DC', tagColor: '#1B6B3A' },
    { icon: '💧', bg: '#E3F2FD', title: 'Stay hydrated throughout the day', desc: 'Drinking 8–10 glasses of water daily supports metabolism, reduces false hunger signals, aids digestion, and improves cognitive performance throughout the day.', tag: 'Hydration', tagBg: '#E3F2FD', tagColor: '#1565C0' },
    { icon: '🌾', bg: '#F3E5F5', title: 'Choose whole grains over refined carbs', desc: 'Whole grains like brown rice, oats, and quinoa provide sustained energy and a steady blood sugar level, reducing the risk of type 2 diabetes and cardiovascular disease.', tag: 'Carbohydrates', tagBg: '#F3E5F5', tagColor: '#6A1B9A' },
    { icon: '🧂', bg: '#FCE4EC', title: 'Watch your sodium intake', desc: 'High sodium contributes to water retention and hypertension. Keep intake below 2,300 mg/day. Season meals with herbs, spices, lemon juice, or garlic instead of salt.', tag: 'Minerals', tagBg: '#FCE4EC', tagColor: '#880E4F' },
    { didYouKnow: true, fact: 'The Mediterranean diet — rich in vegetables, fish, olive oil, and whole grains — is consistently ranked as one of the healthiest eating patterns in the world by nutritional scientists.' }
  ]
};

function renderNutritionTips() {
  if (!USER) return;
  const goal  = USER.goal || 'healthy';
  const tips  = TIPS_DATA[goal] || TIPS_DATA['healthy'];
  const panel = document.getElementById('nutrition-tips-panel');
  const badge = document.getElementById('tips-goal-badge');

  const goalLabels = { lose: '🎯 Goal: Lose Weight', maintain: '🎯 Goal: Maintain Weight', gain: '🎯 Goal: Gain Muscle', healthy: '🎯 Goal: Eat Healthier' };
  badge.textContent = goalLabels[goal] || '🎯 Your Goal';
  panel.querySelectorAll('.tip-card, .did-you-know').forEach(el => el.remove());

  tips.forEach(tip => {
    if (tip.didYouKnow) {
      const dyk = document.createElement('div');
      dyk.className = 'did-you-know';
      dyk.innerHTML = `<strong>Did you know?</strong>${tip.fact}`;
      panel.appendChild(dyk);
    } else {
      const card = document.createElement('div');
      card.className = 'tip-card';
      card.innerHTML = `
        <div class="tip-icon" style="background:${tip.bg};">${tip.icon}</div>
        <div class="tip-body">
          <p class="tip-title">${tip.title}</p>
          <p class="tip-desc">${tip.desc}</p>
          <span class="tip-tag" style="background:${tip.tagBg};color:${tip.tagColor};">${tip.tag}</span>
        </div>`;
      panel.appendChild(card);
    }
  });
}

// =============================================================================
// PROFILE
// =============================================================================

function loadProfileForm() {
  if (!USER) return;
  document.getElementById('set-fname').value  = USER.fname  || '';
  document.getElementById('set-lname').value  = USER.lname  || '';
  document.getElementById('set-age').value    = USER.age    || '';
  document.getElementById('set-gender').value = USER.gender || 'male';
  document.getElementById('set-height').value = USER.height || '';
  document.getElementById('set-weight').value = USER.weight || '';
  document.getElementById('set-goal').value   = USER.goal   || 'maintain';
  document.getElementById('set-cals').value   = USER.cals   || 2000;
}

async function saveProfile() {
  USER.fname  = document.getElementById('set-fname').value.trim();
  USER.lname  = document.getElementById('set-lname').value.trim();
  USER.age    = +document.getElementById('set-age').value;
  USER.gender = document.getElementById('set-gender').value;
  USER.height = +document.getElementById('set-height').value;
  USER.weight = +document.getElementById('set-weight').value;
  USER.goal   = document.getElementById('set-goal').value;
  USER.cals   = +document.getElementById('set-cals').value
    || calcCalTarget(USER.age, USER.gender, USER.height, USER.weight, USER.goal);

  await saveUserProfile(auth.currentUser.uid, USER);
  const init = getInitials(USER);
  document.getElementById('nav-avatar').textContent  = init;
  document.getElementById('prof-avatar').textContent = init;
  updateDashboard();
  showToast('Profile saved successfully!');
}

// =============================================================================
// EXPOSE TO GLOBAL SCOPE
// =============================================================================
window.switchTab              = switchTab;
window.doLogin                = doLogin;
window.doRegister             = doRegister;
window.doLogout               = doLogout;
window.showPage               = showPage;
window.logFood                = logFood;
window.deleteEntry            = deleteEntry;
window.saveProfile            = saveProfile;
window.generateWeeklyInsights = generateWeeklyInsights;
window.checkPassStrength      = checkPassStrength;
window.checkPassMatch         = checkPassMatch;
window.openTerms              = openTerms;
window.closeTerms             = closeTerms;
window.acceptTerms            = acceptTerms;
window.otpMove                = otpMove;
window.otpBack                = otpBack;
window.verifyOTP              = verifyOTP;
window.resendOTP              = resendOTP;
window.closeOTP               = closeOTP;
