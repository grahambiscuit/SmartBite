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

// ---- Your Firebase Config ----
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

// ---- Global State ----
let USER     = null;
let FOOD_LOG = [];

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
    if (FOOD_LOG.some(f => new Date(f.date).toDateString() === ds)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
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
    tabs[0].classList.add('active');
    tabs[1].classList.remove('active');
    login.style.display = 'block';
    reg.style.display   = 'none';
  } else {
    tabs[0].classList.remove('active');
    tabs[1].classList.add('active');
    login.style.display = 'none';
    reg.style.display   = 'block';
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
  const fname  = document.getElementById('reg-fname').value.trim();
  const lname  = document.getElementById('reg-lname').value.trim();
  const email  = document.getElementById('reg-email').value.trim();
  const pass   = document.getElementById('reg-pass').value;
  const age    = document.getElementById('reg-age').value;
  const gender = document.getElementById('reg-gender').value;
  const height = document.getElementById('reg-height').value;
  const weight = document.getElementById('reg-weight').value;
  const goal   = document.getElementById('reg-goal').value;

  if (!fname || !email || !pass || !age || !gender || !height || !weight) {
    showToast('Please fill in all fields'); return;
  }
  if (pass.length < 6) { showToast('Password must be at least 6 characters'); return; }

  try {
    const cred    = await createUserWithEmailAndPassword(auth, email, pass);
    const profile = {
      fname, lname, email,
      age: +age, gender, height: +height, weight: +weight, goal,
      cals: calcCalTarget(+age, gender, +height, +weight, goal)
    };
    await saveUserProfile(cred.user.uid, profile);
    showToast('Account created! Welcome, ' + fname + '!');
  } catch (err) {
    showToast('Registration failed: ' + err.message);
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
    if (x.getAttribute('onclick') && x.getAttribute('onclick').includes("'" + p + "'")) {
      x.classList.add('active');
    }
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
  document.getElementById('s-streak').textContent   = streak;
  document.getElementById('sp-streak').style.width  = Math.min(100, streak * 14) + '%';

  const recent = document.getElementById('dash-recent');
  if (todayLogs.length === 0) {
    recent.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🥦</div>
        <div>No meals logged today</div>
      </div>`;
  } else {
    recent.innerHTML = todayLogs.slice(-6).reverse().map(f => `
      <div class="food-chip">
        <div class="food-dot" style="background:${
          f.rating === 'healthy' ? '#52B788' : f.rating === 'unhealthy' ? '#E63946' : '#F9C74F'
        }"></div>
        <div>
          <div class="food-chip-name">${f.name}</div>
          <div class="food-chip-cal">${f.calories} kcal · ${f.meal}</div>
        </div>
      </div>`).join('');
  }

  const tips  = generateTips(todayLogs, totalCals, target, +bmi);
  const recos = document.getElementById('dash-recos');
  recos.innerHTML = tips.map(t => `
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
  if (logs.length === 0) {
    tips.push({ icon: '🍳', title: 'Start Your Day Right', msg: 'Log your first meal to get personalized nutrition insights and recommendations.' });
  }
  if (cals > target * 1.1) {
    tips.push({ icon: '⚠️', title: 'Calorie Alert', msg: `You've consumed ${cals} kcal today, which is ${cals - target} over your ${target} kcal goal. Consider lighter options for your next meal.` });
  }
  if (cals < target * 0.5 && logs.length > 0) {
    tips.push({ icon: '🥑', title: 'Fuel Up', msg: `You're only at ${cals} kcal — make sure to eat enough to meet your ${target} kcal daily goal.` });
  }
  const unhealthy = logs.filter(f => f.rating === 'unhealthy');
  if (unhealthy.length > 0) {
    tips.push({ icon: '🥗', title: 'Balance Your Plate', msg: `You've logged some less healthy options. Try pairing with vegetables or whole grains for better nutrition balance.` });
  }
  if (bmi > 25) {
    tips.push({ icon: '🚶', title: 'Stay Active', msg: 'Combine your nutrition tracking with regular physical activity. Even a 30-minute walk helps!' });
  }
  if (bmi < 18.5) {
    tips.push({ icon: '🍚', title: 'Increase Intake', msg: 'Your BMI suggests you may benefit from more calorie-dense foods like nuts, legumes, and whole grains.' });
  }
  if (tips.length === 0) {
    tips.push({ icon: '🌟', title: 'Great Job!', msg: "You're on track today! Keep logging your meals consistently for the best insights." });
  }
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

  let rating     = 'moderate';
  let resultHTML = '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are a nutrition expert. Analyze the food item and return ONLY valid JSON with no markdown fences or extra text: {"rating":"healthy"|"moderate"|"unhealthy","calories_estimate":number,"analysis":"2-sentence analysis","nutrients":["nutrient 1","nutrient 2","nutrient 3"],"tip":"one short actionable tip"}`,
        messages: [{
          role: 'user',
          content: `Food: ${name}. User logged ${cal || 'unknown'} calories. User goal: ${USER?.goal || 'healthy eating'}.`
        }]
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

    const entry = {
      name, calories: finalCal, meal, rating,
      date: new Date().toISOString(),
      analysis: parsed.analysis
    };
    const firestoreId = await addFoodEntry(entry);
    FOOD_LOG.push({ firestoreId, ...entry });

  } catch (err) {
    console.error('Analysis error:', err);
    const finalCal = cal || 200;
    resultHTML = `<div style="color:var(--muted);font-size:.85rem">AI analysis unavailable. Food logged with ${finalCal} calories.</div>`;
    const entry = {
      name, calories: finalCal, meal, rating: 'moderate',
      date: new Date().toISOString(), analysis: ''
    };
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
    ? Math.round((todayLogs.filter(f => f.rating === 'healthy').length / todayLogs.length) * 100)
    : 0;

  const bars = [
    { label: 'Calories',      val: Math.min(100, Math.round(totalCals / target * 100)), detail: totalCals + ' / ' + target + ' kcal',     color: 'var(--green)' },
    { label: 'Healthy Foods', val: healthyPct,                                          detail: healthyPct + '% of logged items',          color: '#52B788'      },
    { label: 'Meals Logged',  val: Math.min(100, Math.round(todayLogs.length / 4 * 100)), detail: todayLogs.length + ' of 4 recommended', color: 'var(--blue)'  },
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
        messages: [{
          role: 'user',
          content: `User: ${USER.fname}, goal: ${USER.goal}, BMI: ${calcBMI(USER.height, USER.weight)}, recent foods: ${summary}`
        }]
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
// NUTRITION TIPS PANEL
// =============================================================================

// All available tips, each tagged with which goals they apply to.
// 'all' means the tip shows for every goal.
const NUTRITION_TIPS = [
  // ── Lose Weight ────────────────────────────────────────────────────────────
  {
    goals: ['lose'],
    icon: '🔻', iconBg: '#FCE4EC',
    title: 'Create a moderate calorie deficit',
    desc: 'Aim for 300–500 kcal below your TDEE daily. Cutting too aggressively slows metabolism and causes muscle loss — steady wins the race.',
    tag: 'Calorie Control', tagBg: '#FCE4EC', tagColor: '#880E4F'
  },
  {
    goals: ['lose'],
    icon: '🥚', iconBg: '#FFF3E0',
    title: 'Front-load protein at every meal',
    desc: 'High protein (1.6–2 g/kg body weight) preserves lean mass during a deficit and keeps hunger at bay longer than carbs or fat.',
    tag: 'Satiety', tagBg: '#FFF3E0', tagColor: '#E65100'
  },
  {
    goals: ['lose'],
    icon: '🧃', iconBg: '#FCE4EC',
    title: 'Cut liquid calories first',
    desc: 'Sodas, juices, and fancy coffees can quietly add 300–500 kcal a day. Switching to water, black coffee, or unsweetened tea is the easiest deficit win.',
    tag: 'Quick Win', tagBg: '#FCE4EC', tagColor: '#880E4F'
  },
  {
    goals: ['lose'],
    icon: '🫙', iconBg: '#E8F5E9',
    title: 'Prep meals in advance',
    desc: 'Batch-cooking on weekends means you always have a low-calorie option ready, reducing the chance of impulse, high-calorie choices when hungry.',
    tag: 'Habit', tagBg: '#E8F5E9', tagColor: '#1B6B3A'
  },

  // ── Maintain Weight ────────────────────────────────────────────────────────
  {
    goals: ['maintain'],
    icon: '⚖️', iconBg: '#E3F2FD',
    title: 'Eat at your TDEE, not below',
    desc: 'Maintenance means matching energy in with energy out. Use your calorie target as a daily anchor, not a ceiling to come in under.',
    tag: 'Balance', tagBg: '#E3F2FD', tagColor: '#1565C0'
  },
  {
    goals: ['maintain'],
    icon: '📊', iconBg: '#F3E5F5',
    title: 'Track weight weekly, not daily',
    desc: 'Weight fluctuates 1–2 kg daily from water and food volume. A 7-day rolling average gives a cleaner picture of whether you\'re truly maintaining.',
    tag: 'Monitoring', tagBg: '#F3E5F5', tagColor: '#6A1B9A'
  },
  {
    goals: ['maintain'],
    icon: '🔄', iconBg: '#FFF9C4',
    title: 'Cycle calories around activity',
    desc: 'Eat slightly more on active days and slightly less on rest days. This keeps your weekly average on target while fueling performance.',
    tag: 'Flexibility', tagBg: '#FFF9C4', tagColor: '#F57F17'
  },

  // ── Gain Muscle ────────────────────────────────────────────────────────────
  {
    goals: ['gain'],
    icon: '💪', iconBg: '#E8F5E9',
    title: 'Eat in a lean calorie surplus',
    desc: 'Adding 200–300 kcal above maintenance maximises muscle gain while minimising fat accumulation — a "slow bulk" approach.',
    tag: 'Bulking', tagBg: '#E8F5E9', tagColor: '#1B6B3A'
  },
  {
    goals: ['gain'],
    icon: '🥩', iconBg: '#FFF3E0',
    title: 'Hit 1.6–2.2 g of protein per kg',
    desc: 'Muscle protein synthesis plateaus above ~2.2 g/kg. Spread intake across 3–5 meals for maximum stimulation throughout the day.',
    tag: 'Protein', tagBg: '#FFF3E0', tagColor: '#E65100'
  },
  {
    goals: ['gain'],
    icon: '🍠', iconBg: '#E3F2FD',
    title: 'Time carbs around your workouts',
    desc: 'Carbohydrates replenish muscle glycogen. A carb-rich meal 1–2 hours pre-workout and again post-workout boosts performance and recovery.',
    tag: 'Nutrient Timing', tagBg: '#E3F2FD', tagColor: '#1565C0'
  },
  {
    goals: ['gain'],
    icon: '🛌', iconBg: '#EDE7F6',
    title: 'Prioritise sleep for muscle repair',
    desc: 'Growth hormone peaks during deep sleep. Aim for 7–9 hours — inadequate sleep blunts the anabolic response even with perfect nutrition.',
    tag: 'Recovery', tagBg: '#EDE7F6', tagColor: '#4527A0'
  },

  // ── Eat Healthier ──────────────────────────────────────────────────────────
  {
    goals: ['healthy'],
    icon: '🌈', iconBg: '#E8F5E9',
    title: 'Eat the rainbow every day',
    desc: 'Different pigments in fruits and vegetables represent different antioxidants and phytonutrients. Aim for at least 5 colours on your plate daily.',
    tag: 'Micronutrients', tagBg: '#E8F5E9', tagColor: '#1B6B3A'
  },
  {
    goals: ['healthy'],
    icon: '🫀', iconBg: '#FCE4EC',
    title: 'Swap saturated fats for unsaturated',
    desc: 'Replace butter, coconut oil, and fatty meats with olive oil, avocado, and oily fish. This shift significantly improves cardiovascular markers.',
    tag: 'Heart Health', tagBg: '#FCE4EC', tagColor: '#880E4F'
  },
  {
    goals: ['healthy'],
    icon: '🫘', iconBg: '#FFF9C4',
    title: 'Add legumes three times a week',
    desc: 'Lentils, chickpeas, and black beans are protein- and fibre-dense, reduce LDL cholesterol, and feed beneficial gut bacteria.',
    tag: 'Gut Health', tagBg: '#FFF9C4', tagColor: '#F57F17'
  },
  {
    goals: ['healthy'],
    icon: '🚫', iconBg: '#FAFAFA',
    title: 'Limit ultra-processed food to < 20%',
    desc: 'Ultra-processed foods (chips, instant noodles, packaged snacks) are linked to higher all-cause mortality. Keep them the minority, not the majority.',
    tag: 'Food Quality', tagBg: '#FAFAFA', tagColor: '#555'
  },

  // ── Universal tips (shown for ALL goals) ───────────────────────────────────
  {
    goals: ['all'],
    icon: '🥦', iconBg: '#D8F3DC',
    title: 'Fill half your plate with vegetables',
    desc: 'Non-starchy vegetables are low in calories and high in fibre, keeping you full longer while supplying essential vitamins and minerals.',
    tag: 'General Health', tagBg: '#D8F3DC', tagColor: '#1B6B3A'
  },
  {
    goals: ['all'],
    icon: '💧', iconBg: '#E3F2FD',
    title: 'Stay hydrated throughout the day',
    desc: 'Drinking 8–10 glasses of water daily supports metabolism, reduces false hunger signals, and improves nutrient absorption.',
    tag: 'Hydration', tagBg: '#E3F2FD', tagColor: '#1565C0'
  },
  {
    goals: ['all'],
    icon: '🌾', iconBg: '#F3E5F5',
    title: 'Choose whole grains over refined carbs',
    desc: 'Whole grains like brown rice, oats, and quinoa digest slowly, providing sustained energy and preventing blood sugar spikes.',
    tag: 'Carbohydrates', tagBg: '#F3E5F5', tagColor: '#6A1B9A'
  },
  {
    goals: ['all'],
    icon: '🕗', iconBg: '#FFFDE7',
    title: "Don't skip breakfast",
    desc: 'A balanced breakfast kickstarts your metabolism and reduces the likelihood of overeating later in the day.',
    tag: 'Meal Timing', tagBg: '#FFFDE7', tagColor: '#F57F17'
  },
  {
    goals: ['all'],
    icon: '🧂', iconBg: '#FCE4EC',
    title: 'Watch your sodium intake',
    desc: 'High sodium can cause water retention and raise blood pressure. Limit processed foods and season with herbs and spices instead.',
    tag: 'Minerals', tagBg: '#FCE4EC', tagColor: '#880E4F'
  }
];

// Goal metadata: human-readable label + badge emoji
const GOAL_META = {
  lose:     { label: 'Lose Weight',    emoji: '🎯' },
  maintain: { label: 'Maintain Weight', emoji: '⚖️' },
  gain:     { label: 'Gain Muscle',    emoji: '💪' },
  healthy:  { label: 'Eat Healthier',  emoji: '🌿' }
};

// "Did you know?" facts keyed by goal
const DID_YOU_KNOW = {
  lose:     'Research shows that eating slowly reduces total calorie intake by up to 20% — it takes ~20 minutes for your brain to register fullness. Put the fork down between bites.',
  maintain: 'Studies show that people who weigh themselves regularly are more successful at long-term weight maintenance. Once a week, same conditions, is the sweet spot.',
  gain:     'Muscle protein synthesis is maximally stimulated by as little as 20–40 g of high-quality protein per meal. Eating more in one sitting doesn\'t add extra benefit.',
  healthy:  'The gut microbiome influences mood, immunity, and metabolism. Fermented foods like yogurt, kimchi, and kefir introduce beneficial bacteria that support overall health.'
};

/**
 * Renders the Nutrition Tips panel based on the current user's goal.
 * Safe to call any time USER is set — it fully rebuilds the panel.
 */
function renderNutritionTips() {
  if (!USER) return;

  const goal   = USER.goal || 'healthy';
  const meta   = GOAL_META[goal] || { label: 'Your Goal', emoji: '🎯' };
  const factEl = document.getElementById('nutrition-tips-panel');
  if (!factEl) return;

  // Filter: keep tips tagged for this specific goal OR tagged 'all'
  const relevant = NUTRITION_TIPS.filter(t => t.goals.includes(goal) || t.goals.includes('all'));

  // Update the goal badge
  const badge = document.getElementById('tips-goal-badge');
  if (badge) {
    badge.textContent = meta.emoji + ' ' + meta.label;
  }

  // Build tip cards HTML
  const cardsHTML = relevant.map(t => `
    <div class="tip-card">
      <div class="tip-icon" style="background:${t.iconBg}">${t.icon}</div>
      <div class="tip-body">
        <p class="tip-title">${t.title}</p>
        <p class="tip-desc">${t.desc}</p>
        <span class="tip-tag" style="background:${t.tagBg};color:${t.tagColor}">${t.tag}</span>
      </div>
    </div>`).join('');

  // Build "Did you know?" block
  const didYouKnow = `
    <div class="did-you-know">
      <strong>Did you know?</strong>
      ${DID_YOU_KNOW[goal] || DID_YOU_KNOW['healthy']}
    </div>`;

  // Re-render the full panel (badge stays in place, cards + fact replace the rest)
  factEl.innerHTML = `
    <div class="goal-badge" id="tips-goal-badge">${meta.emoji} ${meta.label}</div>
    ${cardsHTML}
    ${didYouKnow}`;
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

  // Re-render tips so they immediately reflect the new goal
  renderNutritionTips();

  showToast('Profile saved successfully!');
}

// =============================================================================
// EXPOSE TO GLOBAL SCOPE (required for HTML onclick handlers)
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
