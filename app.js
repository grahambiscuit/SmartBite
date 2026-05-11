/* =============================================
   SMARTBITE — app.js  (Final Version)
   ============================================= */

import { initializeApp }                         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut,
         onAuthStateChanged }                    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc,
         collection, addDoc, getDocs,
         deleteDoc, query, orderBy }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ── Firebase Config ── */
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

/* ── EmailJS Config ── */
const EMAILJS_SERVICE_ID  = 'service_xi0um8w';
const EMAILJS_TEMPLATE_ID = 'template_brnx7yj';
const EMAILJS_PUBLIC_KEY  = 'koTFYwKltn5wUm99V';

/* ── Groq Config ──
   FREE: no credit card, no region restrictions, very fast.
   Get your key at: https://console.groq.com
   Click "API Keys" → "Create API Key" → paste it below.               */
const GROQ_API_KEY = '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';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';  // free, powerful

/* ── Global State ── */
let USER              = null;
let FOOD_LOG          = [];
let PENDING_OTP       = null;
let FOOD_PHOTO_BASE64 = null;   // base64 string (no data-URL prefix)
let FOOD_PHOTO_MIME   = 'image/jpeg';

// =============================================================================
// GROQ API HELPER  — 100% free, no region limits, very fast
// Text-only (Groq doesn’t support image input on free tier).
// For food photos, we describe the image to AI via filename/user hint.
// =============================================================================
async function callGroq({ system, prompt, imageBase64 = null, imageMime = 'image/jpeg' }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });

  // If an image is attached, ask the model to work from the user’s description
  // Groq’s free LLaMA models don’t accept raw images, so we note it in the prompt
  const fullPrompt = imageBase64
    ? `The user has uploaded a photo of their food. ${prompt}`
    : prompt;

  messages.push({ role: 'user', content: fullPrompt });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages,
      temperature: 0.4,
      max_tokens:  1000
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

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
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (FOOD_LOG.some(f => new Date(f.date).toDateString() === d.toDateString())) streak++;
    else break;
  }
  return streak;
}

function generateOTPCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function safeParseJSON(text) {
  /* strips markdown fences then parses */
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    /* try to extract first {...} block */
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse JSON from response');
  }
}

// =============================================================================
// DARK MODE
// =============================================================================
function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-toggle-btn').classList.toggle('on', !isDark);
  localStorage.setItem('sb-theme', isDark ? 'light' : 'dark');
}

function initTheme() {
  const saved = localStorage.getItem('sb-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  if (saved === 'dark') document.getElementById('theme-toggle-btn').classList.add('on');
}

// =============================================================================
// BURGER MENU
// =============================================================================
function openBurger() {
  document.getElementById('burger-menu').classList.add('open');
  document.getElementById('burger-overlay').classList.add('open');
}

function closeBurger() {
  document.getElementById('burger-menu').classList.remove('open');
  document.getElementById('burger-overlay').classList.remove('open');
}

function updateBurgerActive(p) {
  document.querySelectorAll('.burger-link').forEach(l => {
    l.classList.toggle('active', l.textContent.trim().toLowerCase().includes(
      p === 'recommendations' ? 'advice' : p === 'log' ? 'food' : p
    ));
  });
}

// =============================================================================
// PASSWORD HELPERS
// =============================================================================
function togglePass(id, btn) {
  const input  = document.getElementById(id);
  const isPass = input.type === 'password';
  input.type   = isPass ? 'text' : 'password';
  btn.innerHTML = isPass
    ? '<i data-lucide="eye-off" width="16" height="16"></i>'
    : '<i data-lucide="eye"     width="16" height="16"></i>';
  if (window.lucide) lucide.createIcons();
}

function checkGmail() {
  const val  = document.getElementById('reg-email').value.trim();
  const hint = document.getElementById('gmail-hint');
  if (!val) { hint.textContent = ''; return; }
  if (val.endsWith('@gmail.com')) {
    hint.textContent = '✓ Valid Gmail address';
    hint.style.color = '#52B788';
  } else {
    hint.textContent = '✗ Only Gmail addresses are accepted (@gmail.com)';
    hint.style.color = '#E63946';
  }
}

function checkPassStrength() {
  const pass = document.getElementById('reg-pass').value;
  const bar  = document.getElementById('pass-bar');
  const hint = document.getElementById('pass-hint');
  const rules = {
    len:     pass.length >= 8,
    upper:   /[A-Z]/.test(pass),
    num:     /[0-9]/.test(pass),
    special: /[^A-Za-z0-9]/.test(pass)
  };
  const ruleTexts = {
    len:     'At least 8 characters',
    upper:   'One uppercase letter (A-Z)',
    num:     'One number (0-9)',
    special: 'One special character (!@#$%)'
  };
  Object.entries(rules).forEach(([k, ok]) => {
    const el = document.getElementById('r-' + k);
    if (!el) return;
    el.classList.toggle('ok', ok);
    el.innerHTML = `<i data-lucide="${ok ? 'check-circle' : 'circle'}" width="12" height="12"></i> ${ruleTexts[k]}`;
  });
  if (window.lucide) lucide.createIcons();
  const score  = Object.values(rules).filter(Boolean).length;
  const levels = [
    { w: '0%',   bg: 'transparent', text: '' },
    { w: '25%',  bg: '#E63946',     text: 'Weak'   },
    { w: '50%',  bg: '#F9C74F',     text: 'Fair'   },
    { w: '75%',  bg: '#52B788',     text: 'Good'   },
    { w: '100%', bg: '#2D6A4F',     text: 'Strong' },
  ];
  const lvl        = Math.min(score, 4);
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
function openTerms()  { document.getElementById('terms-modal').style.display = 'flex'; }
function closeTerms() { document.getElementById('terms-modal').style.display = 'none'; }
function acceptTerms() {
  document.getElementById('reg-terms').checked = true;
  closeTerms();
  showToast('Terms accepted ✓');
}

// =============================================================================
// PROFILE PICTURE
// =============================================================================
function handleProfilePic(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const src = e.target.result;
    localStorage.setItem('sb-profile-pic', src);
    applyProfilePic(src);
  };
  reader.readAsDataURL(file);
}

function applyProfilePic(src) {
  const img       = document.getElementById('prof-avatar-img');
  const initials  = document.getElementById('prof-avatar-initials');
  const navAvatar = document.getElementById('nav-avatar');
  const burgerAv  = document.getElementById('burger-avatar');
  if (!src) return;
  img.src = src;
  img.style.display = 'block';
  if (initials) initials.style.display = 'none';
  navAvatar.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  burgerAv.innerHTML  = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
}

function loadProfilePic() {
  const src = localStorage.getItem('sb-profile-pic');
  if (src) applyProfilePic(src);
}

// =============================================================================
// FOOD PHOTO HANDLING
// =============================================================================
function handleFoodPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  FOOD_PHOTO_MIME = file.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = e => {
    const src = e.target.result;
    FOOD_PHOTO_BASE64 = src.split(',')[1];
    showFoodPhotoPreview(src);
  };
  reader.readAsDataURL(file);
}

function handlePhotoDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const input = document.getElementById('food-photo-input');
  const dt    = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  handleFoodPhoto(input);
}

function showFoodPhotoPreview(src) {
  document.getElementById('photo-upload-inner').style.display   = 'none';
  document.getElementById('photo-preview-wrap').style.display   = 'block';
  document.getElementById('food-photo-preview').src             = src;
  document.getElementById('photo-upload-zone').classList.add('has-photo');
}

function clearFoodPhoto(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  FOOD_PHOTO_BASE64 = null;
  FOOD_PHOTO_MIME   = 'image/jpeg';
  document.getElementById('photo-upload-inner').style.display   = '';
  document.getElementById('photo-preview-wrap').style.display   = 'none';
  document.getElementById('food-photo-preview').src             = '';
  document.getElementById('photo-upload-zone').classList.remove('has-photo');
  document.getElementById('food-photo-input').value             = '';
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
  emailjs.init(EMAILJS_PUBLIC_KEY);
  await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email: email,
    to_name:  name,
    otp_code: code,
  });
}

async function resendOTP() {
  if (!PENDING_OTP) return;
  const newCode           = generateOTPCode();
  PENDING_OTP.code        = newCode;
  PENDING_OTP.expires     = Date.now() + 10 * 60 * 1000;
  document.getElementById('otp-error').textContent = '';
  for (let i = 1; i <= 6; i++) document.getElementById('otp-' + i).value = '';
  document.getElementById('otp-1').focus();
  try {
    await sendOTPEmail(PENDING_OTP.email, PENDING_OTP.profile.fname, newCode);
    showToast('A new code has been sent!');
  } catch { showToast('Failed to resend. Try again.'); }
}

async function verifyOTP() {
  if (!PENDING_OTP) return;
  const entered = Array.from({length: 6}, (_, i) => document.getElementById('otp-' + (i + 1)).value).join('');
  const errEl   = document.getElementById('otp-error');
  if (entered.length < 6)            { errEl.textContent = 'Please enter all 6 digits.'; return; }
  if (Date.now() > PENDING_OTP.expires) { errEl.textContent = 'Code expired. Request a new one.'; return; }
  if (entered !== PENDING_OTP.code)  {
    errEl.textContent = 'Incorrect code. Try again.';
    for (let i = 1; i <= 6; i++) document.getElementById('otp-' + i).value = '';
    document.getElementById('otp-1').focus();
    return;
  }
  errEl.textContent = '';
  try {
    const cred = await createUserWithEmailAndPassword(auth, PENDING_OTP.email, PENDING_OTP.password);
    await saveUserProfile(cred.user.uid, PENDING_OTP.profile);
    const fname = PENDING_OTP.profile.fname;
    PENDING_OTP = null;
    document.getElementById('otp-screen').style.display = 'none';
    showToast(`Account verified! Welcome, ${fname}! 🎉`);
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
    USER = null; FOOD_LOG = [];
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
    login.style.display = 'block';     reg.style.display   = 'none';
  } else {
    tabs[0].classList.remove('active'); tabs[1].classList.add('active');
    login.style.display = 'none';      reg.style.display   = 'block';
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

  if (!fname || !email || !pass || !confirm || !age || !gender || !height || !weight)
    { showToast('Please fill in all fields'); return; }
  if (!email.endsWith('@gmail.com'))
    { showToast('Only Gmail addresses are accepted'); return; }
  if (pass.length < 8)
    { showToast('Password must be at least 8 characters'); return; }
  if (!/[A-Z]/.test(pass))
    { showToast('Password must contain at least one uppercase letter'); return; }
  if (!/[0-9]/.test(pass))
    { showToast('Password must contain at least one number'); return; }
  if (!/[^A-Za-z0-9]/.test(pass))
    { showToast('Password must contain at least one special character'); return; }
  if (pass !== confirm)
    { showToast('Passwords do not match'); return; }
  if (!termsOk)
    { showToast('Please agree to the Terms of Service'); return; }

  const code  = generateOTPCode();
  PENDING_OTP = {
    code, email, password: pass,
    expires: Date.now() + 10 * 60 * 1000,
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
    showToast('Failed to send verification email. Try again.');
    PENDING_OTP = null;
  }
}

async function doLogout() {
  await signOut(auth);
  USER = null; FOOD_LOG = [];
  localStorage.removeItem('sb-profile-pic');
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
  document.getElementById('nav-avatar').textContent    = init;
  document.getElementById('burger-avatar').textContent = init;
  document.getElementById('burger-name').textContent   = USER.fname + ' ' + USER.lname;
  document.getElementById('burger-email').textContent  = USER.email;
  loadProfilePic();
  updateDashboard();
  loadProfileForm();
  if (window.lucide) lucide.createIcons();
}

function showPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  updateBurgerActive(p);
  if (p === 'dashboard')       updateDashboard();
  if (p === 'recommendations') { generateWeeklyInsights(); renderNutritionTips(); }
  if (p === 'log')             renderLogEntries();
  if (window.lucide) lucide.createIcons();
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
  const bmiNotes = {
    'Normal Weight': 'Great shape! Keep it up.',
    'Underweight':   'Consider increasing caloric intake.',
    'Overweight':    'A healthy diet can help.',
    'Obese':         'Consult a healthcare provider.'
  };
  document.getElementById('dash-bmi-note').textContent = bmiNotes[cat] || '';

  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting').textContent = `${greet}, ${USER.fname}!`;
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const today     = new Date().toDateString();
  const todayLogs = FOOD_LOG.filter(f => new Date(f.date).toDateString() === today);
  const totalCals = todayLogs.reduce((s, f) => s + (f.calories || 0), 0);
  const target    = USER.cals || 2000;

  document.getElementById('dash-cals-today').textContent = totalCals;
  document.getElementById('dash-cals-goal').textContent  = `/ ${target} kcal goal`;
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

  renderDashTip();

  const recent = document.getElementById('dash-recent');
  if (todayLogs.length === 0) {
    recent.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div>No meals logged today</div></div>`;
  } else {
    recent.innerHTML = todayLogs.slice(-6).reverse().map(f => `
      <div class="food-chip">
        <div class="food-dot" style="background:${f.rating==='healthy'?'#52B788':f.rating==='unhealthy'?'#E63946':'#F9C74F'}"></div>
        <div>
          <div class="food-chip-name">${f.name}${f.hasPhoto ? ' 📷' : ''}</div>
          <div class="food-chip-cal">${f.calories} kcal · ${f.meal}</div>
        </div>
      </div>`).join('');
  }

  const recoTips = generateDashTips(todayLogs, totalCals, target, +bmi);
  document.getElementById('dash-recos').innerHTML = recoTips.map(t => `
    <div class="reco-card">
      <div class="reco-icon">${t.iconSvg}</div>
      <div class="reco-text"><strong>${t.title}</strong>${t.msg}</div>
    </div>`).join('');

  /* sync profile sidebar */
  document.getElementById('prof-bmi').textContent   = bmi;
  document.getElementById('prof-wt').textContent    = USER.weight;
  document.getElementById('prof-ht').textContent    = USER.height;
  document.getElementById('prof-name').textContent  = USER.fname + ' ' + USER.lname;
  document.getElementById('prof-email').textContent = USER.email;

  if (window.lucide) lucide.createIcons();
}

function renderDashTip() {
  if (!USER) return;
  const goal       = USER.goal || 'healthy';
  const goalLabels = { lose:'Lose Weight', maintain:'Maintain Weight', gain:'Gain Muscle', healthy:'Eat Healthier' };
  document.getElementById('dash-tip-badge').textContent = goalLabels[goal] || 'Your Goal';
  const tips      = TIPS_DATA[goal] || TIPS_DATA['healthy'];
  const staticTips = tips.filter(t => !t.didYouKnow);
  const pick       = staticTips[Math.floor(Date.now() / 86400000) % staticTips.length];
  if (pick) document.getElementById('dash-tip-body').textContent = pick.title + ' — ' + pick.desc;
}

function svg(path, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">${path}</svg>`;
}

function generateDashTips(logs, cals, target, bmi) {
  const tips = [];
  if (logs.length === 0)
    tips.push({ iconSvg: svg('<path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 6v6l4 2"/>', 'var(--orange)'), title: 'Start Your Day Right ', msg: 'Log your first meal to get personalized nutrition insights.' });
  if (cals > target * 1.1)
    tips.push({ iconSvg: svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 'var(--orange)'), title: 'Calorie Alert ', msg: `You've consumed ${cals} kcal — ${cals - target} over your ${target} kcal goal.` });
  if (cals < target * 0.5 && logs.length > 0)
    tips.push({ iconSvg: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>', 'var(--orange)'), title: 'Fuel Up ', msg: `You're only at ${cals} kcal. Make sure to meet your ${target} kcal daily goal.` });
  if (logs.filter(f => f.rating === 'unhealthy').length > 0)
    tips.push({ iconSvg: svg('<path d="M3 11l19-9-9 19-2-8-8-2z"/>', 'var(--green)'), title: 'Balance Your Plate ', msg: "You've logged some less healthy options. Try pairing with vegetables or whole grains." });
  if (bmi > 25)
    tips.push({ iconSvg: svg('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>', 'var(--orange)'), title: 'Stay Active ', msg: 'Combine nutrition tracking with regular physical activity. Even a 30-min walk helps!' });
  if (bmi < 18.5)
    tips.push({ iconSvg: svg('<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>', 'var(--orange)'), title: 'Increase Intake ', msg: 'Your BMI suggests you may benefit from more calorie-dense foods like nuts and legumes.' });
  if (tips.length === 0)
    tips.push({ iconSvg: svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', 'var(--orange)'), title: 'Great Job! ', msg: "You're on track today! Keep logging consistently for the best insights." });
  return tips.slice(0, 3);
}

// =============================================================================
// FOOD LOG  —  PHOTO-FIRST AI ANALYSIS
// =============================================================================
async function logFood() {
  const name = document.getElementById('food-name').value.trim();
  const meal = document.getElementById('food-meal').value;

  if (!FOOD_PHOTO_BASE64 && !name) {
    showToast('Please take a photo or enter a food name');
    return;
  }

  const area = document.getElementById('analysis-area');
  area.style.display = 'block';
  document.getElementById('analysis-loading').style.display = 'flex';
  document.getElementById('analysis-result').style.display  = 'none';

  let rating = 'moderate', resultHTML = '';

  try {
    /* ── Build prompt for AI ── */
    const foodPrompt = FOOD_PHOTO_BASE64
      ? `Carefully analyze this food photo${name ? ` (user says: "${name}")` : ''}.\nUser's goal: ${USER?.goal || 'healthy eating'}.\nReturn ONLY valid JSON — no markdown, no explanation:\n{"food_name":"exact identified dish","rating":"healthy"|"moderate"|"unhealthy","calories_estimate":NUMBER,"analysis":"2-sentence nutrition analysis","nutrients":["nutrient1","nutrient2","nutrient3"],"tip":"one short actionable tip"}`
      : `Analyze this food item: "${name}".\nUser's goal: ${USER?.goal || 'healthy eating'}.\nReturn ONLY valid JSON — no markdown, no explanation:\n{"food_name":"${name}","rating":"healthy"|"moderate"|"unhealthy","calories_estimate":NUMBER,"analysis":"2-sentence nutrition analysis","nutrients":["nutrient1","nutrient2","nutrient3"],"tip":"one short actionable tip"}`;

    const raw    = await callGroq({
      system:      'You are a certified nutrition expert. Return accurate, realistic calorie estimates specific to the actual food. Respond ONLY with valid JSON, no markdown fences.',
      prompt:      foodPrompt,
      imageBase64: FOOD_PHOTO_BASE64 || null,
      imageMime:   FOOD_PHOTO_MIME
    });

    const parsed   = safeParseJSON(raw);
    rating         = parsed.rating || 'moderate';
    const finalCal = Math.round(parsed.calories_estimate) || 0;
    const foodName = parsed.food_name || name || 'Unknown food';
    const bc       = rating === 'healthy' ? 'badge-healthy' : rating === 'unhealthy' ? 'badge-unhealthy' : 'badge-moderate';
    const ratingLabel = rating.charAt(0).toUpperCase() + rating.slice(1);

    resultHTML = `
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.75rem;flex-wrap:wrap">
        <span style="font-weight:700;font-size:1rem;color:var(--text)">${foodName}</span>
        <span class="entry-badge ${bc}" style="font-size:.8rem;padding:.3rem .85rem">${ratingLabel}</span>
        <span style="font-size:.9rem;color:var(--green);font-weight:800">~${finalCal} kcal</span>
        ${FOOD_PHOTO_BASE64 ? '<span style="font-size:.72rem;color:var(--muted);background:var(--green-pale);padding:2px 9px;border-radius:999px">📷 Photo analyzed</span>' : ''}
      </div>
      <p style="margin-bottom:.65rem;font-size:.88rem;line-height:1.65">${parsed.analysis}</p>
      <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-bottom:.65rem">
        ${(parsed.nutrients || []).map(n => `<span style="background:var(--green-pale);color:var(--green);font-size:.75rem;padding:.22rem .65rem;border-radius:20px">${n}</span>`).join('')}
      </div>
      <div style="font-size:.83rem;color:var(--orange);font-weight:600">💡 ${parsed.tip}</div>`;

    const entry = {
      name: foodName, calories: finalCal, meal, rating,
      date: new Date().toISOString(), analysis: parsed.analysis, hasPhoto: !!FOOD_PHOTO_BASE64
    };
    const firestoreId = await addFoodEntry(entry);
    FOOD_LOG.push({ firestoreId, ...entry });

  } catch (err) {
    console.error('Analysis error:', err);
    /* Smart fallback — estimate by name if no photo */
    const fallbackName = name || 'Food item';
    const fallbackCal  = estimateCaloriesFallback(fallbackName);
    resultHTML = `
      <div style="color:var(--muted);font-size:.85rem;line-height:1.6">
        <strong style="color:var(--text)">${fallbackName}</strong><br>
        AI analysis unavailable right now (${err.message}).<br>
        Logged with estimated <strong style="color:var(--green)">${fallbackCal} kcal</strong> based on food type.
      </div>`;
    const entry = {
      name: fallbackName, calories: fallbackCal, meal, rating: 'moderate',
      date: new Date().toISOString(), analysis: '', hasPhoto: !!FOOD_PHOTO_BASE64
    };
    const firestoreId = await addFoodEntry(entry);
    FOOD_LOG.push({ firestoreId, ...entry });
  }

  renderLogEntries();
  updateDashboard();
  document.getElementById('food-name').value = '';
  clearFoodPhoto(null);
  showToast('Food logged successfully!');
  document.getElementById('analysis-loading').style.display = 'none';
  document.getElementById('analysis-result').style.display  = 'block';
  document.getElementById('analysis-result').innerHTML      = resultHTML;
  if (window.lucide) lucide.createIcons();
}

/* Rough fallback calorie estimates by keyword */
function estimateCaloriesFallback(name) {
  const n = name.toLowerCase();
  if (/rice|kanin|sinangag/.test(n))            return 300;
  if (/adobo|pork|baboy/.test(n))               return 420;
  if (/chicken|manok/.test(n))                  return 280;
  if (/fish|isda|bangus|tilapia/.test(n))       return 220;
  if (/egg|itlog/.test(n))                      return 140;
  if (/burger|sandwich/.test(n))                return 480;
  if (/pizza/.test(n))                          return 520;
  if (/salad/.test(n))                          return 120;
  if (/fruit|prutas|banana|apple|mango/.test(n)) return 90;
  if (/noodle|pasta|mie|pancit/.test(n))        return 380;
  if (/cake|pastry|donut|cookie/.test(n))       return 350;
  if (/coffee|kape/.test(n))                    return 80;
  if (/juice|soda|softdrink/.test(n))           return 130;
  if (/soup|sabaw/.test(n))                     return 160;
  if (/sinigang|nilaga|tinola/.test(n))         return 250;
  if (/lechon|liempo/.test(n))                  return 480;
  return 250; // generic default
}

function renderLogEntries() {
  const today     = new Date().toDateString();
  const todayLogs = FOOD_LOG.filter(f => new Date(f.date).toDateString() === today);
  const container = document.getElementById('log-entries');

  if (todayLogs.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <i data-lucide="utensils-crossed" width="40" height="40" style="color:var(--muted);margin-bottom:.8rem"></i>
      <div>No foods logged yet today</div>
      <div class="empty-hint">Take a photo or type your first meal above</div>
    </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = [...todayLogs].reverse().map(f => {
    const bc = f.rating === 'healthy' ? 'badge-healthy' : f.rating === 'unhealthy' ? 'badge-unhealthy' : 'badge-moderate';
    return `<div class="log-entry">
      <span class="entry-meal meal-tag-${f.meal}">${f.meal}</span>
      <span class="entry-name">${f.name}${f.hasPhoto ? ' 📷' : ''}</span>
      <span class="entry-cal">${f.calories} kcal</span>
      <span class="entry-badge ${bc}">${f.rating}</span>
      <button onclick="window.deleteEntry('${f.firestoreId}')"
        style="background:none;border:none;cursor:pointer;color:var(--muted);padding:.2rem .4rem;border-radius:6px"
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
// SMART ADVICE PAGE
// =============================================================================
async function generateWeeklyInsights() {
  if (!USER) return;
  const el = document.getElementById('weekly-insights');
  el.innerHTML = '<div class="analysis-loading"><div class="spinner"></div> Generating insights...</div>';

  const week    = FOOD_LOG.slice(-20);
  const summary = week.length
    ? week.map(f => `${f.name}(${f.calories}kcal,${f.rating})`).join(', ')
    : 'No food logged yet';

  try {
    const text = await callGroq({
      system:  'You are a friendly, concise nutrition coach. Give exactly 3 personalized weekly insights as bullet points with emoji. Total response under 130 words. Be specific to the user\'s actual food choices.',
      prompt:  `User: ${USER.fname}. Goal: ${USER.goal}. BMI: ${calcBMI(USER.height, USER.weight)}. Age: ${USER.age}. Recent foods: ${summary}`
    });
    el.innerHTML = text.replace(/\n/g, '<br>');
  } catch (err) {
    el.innerHTML = `<span style="color:var(--muted);font-size:.85rem">Could not generate insights: ${err.message}. Log more meals and try again.</span>`;
  }
}

async function generateAIAdvice() {
  if (!USER) return;
  const btn    = document.querySelector('#ai-advice-content .btn-primary');
  const result = document.getElementById('ai-advice-result');
  btn.disabled        = true;
  btn.textContent     = 'Generating…';
  result.style.display = 'none';

  const bmi     = calcBMI(USER.height, USER.weight);
  const cat     = getBMICat(+bmi);
  const today   = new Date().toDateString();
  const logs    = FOOD_LOG.filter(f => new Date(f.date).toDateString() === today);
  const todaySum = logs.length
    ? logs.map(f => `${f.name}(${f.calories}kcal,${f.rating})`).join(', ')
    : 'No food logged today';
  const recentSum = FOOD_LOG.slice(-10).length
    ? FOOD_LOG.slice(-10).map(f => `${f.name}(${f.calories}kcal)`).join(', ')
    : 'No recent history';

  try {
    const text = await callGroq({
      system:  `You are SmartBite AI, a warm, professional nutrition advisor. Write personalized advice using this structure:
1. Personal greeting using the user's name
2. Brief assessment of their current BMI and eating patterns (2-3 sentences)
3. Three numbered, specific actionable recommendations tailored to their goal
4. One motivational closing sentence
Use plain text with line breaks only. Be specific, evidence-based, and encouraging. Around 200 words.`,
      prompt:  `Name: ${USER.fname}. Goal: ${USER.goal}. BMI: ${bmi} (${cat}). Age: ${USER.age}. Gender: ${USER.gender}. Height: ${USER.height}cm. Weight: ${USER.weight}kg. Daily calorie target: ${USER.cals} kcal. Today's food: ${todaySum}. Recent history: ${recentSum}.`
    });
    result.style.display = 'block';
    result.innerHTML     = text.replace(/\n/g, '<br>');
  } catch (err) {
    result.style.display  = 'block';
    result.innerHTML      = `<span style="color:var(--red)">Could not generate advice: ${err.message}. Please check your API key and try again.</span>`;
  }

  btn.disabled  = false;
  btn.innerHTML = '<i data-lucide="sparkles" width="15" height="15"></i> Regenerate Advice';
  if (window.lucide) lucide.createIcons();
}

// =============================================================================
// NUTRITION TIPS DATA
// =============================================================================
const TIPS_DATA = {
  lose: [
    { icon:'leaf',      bg:'#D8F3DC', title:'Create a sustainable calorie deficit',   desc:'Aim for 300–500 kcal below your TDEE daily. Gradual reduction preserves lean mass while burning fat.',                         tag:'Weight Loss',    tagBg:'#D8F3DC', tagColor:'#1B6B3A' },
    { icon:'drumstick', bg:'#FFF3E0', title:'High protein keeps hunger at bay',        desc:'Target 1.2–1.6 g protein per kg bodyweight using chicken, fish, eggs, or legumes.',                                              tag:'Macronutrients', tagBg:'#FFF3E0', tagColor:'#E65100' },
    { icon:'wheat',     bg:'#F3E5F5', title:'Swap refined carbs for whole grains',     desc:'Brown rice, oats, and quinoa digest slower, keeping blood sugar stable and hunger controlled for hours.',                        tag:'Carbohydrates',  tagBg:'#F3E5F5', tagColor:'#6A1B9A' },
    { icon:'droplets',  bg:'#E3F2FD', title:'Drink water before every meal',           desc:'500 ml of water 30 minutes before meals reduces calorie intake by up to 13%.',                                                   tag:'Hydration',      tagBg:'#E3F2FD', tagColor:'#1565C0' },
    { didYouKnow: true, fact: 'Eating slowly can reduce total calorie intake by up to 20%. It takes 20 minutes for your brain to register fullness.' }
  ],
  maintain: [
    { icon:'scale',    bg:'#E8F5E9', title:'Match energy in with energy out',          desc:'Track calories a few days per week to stay aware of your intake without obsessing over every meal.',                             tag:'Energy Balance', tagBg:'#E8F5E9', tagColor:'#2E7D32' },
    { icon:'salad',    bg:'#D8F3DC', title:'Eat a wide variety of whole foods',         desc:'Aim for 30 different plant foods per week — vegetables, fruits, grains, legumes, nuts.',                                        tag:'Food Variety',   tagBg:'#D8F3DC', tagColor:'#1B6B3A' },
    { icon:'clock',    bg:'#FFFDE7', title:'Keep consistent meal timing',               desc:'Regular intervals regulate hunger hormones, preventing the urge to overeat at any single sitting.',                               tag:'Meal Timing',    tagBg:'#FFFDE7', tagColor:'#F57F17' },
    { icon:'salt',     bg:'#FCE4EC', title:'Limit ultra-processed food intake',         desc:'Keep ultra-processed foods below 20% of your diet to reduce unintentional weight gain.',                                        tag:'Food Quality',   tagBg:'#FCE4EC', tagColor:'#880E4F' },
    { didYouKnow: true, fact: 'People who weigh themselves weekly are significantly better at maintaining weight long-term than those who avoid the scale.' }
  ],
  gain: [
    { icon:'flame',    bg:'#FFF3E0', title:'Eat in a controlled calorie surplus',       desc:'Target 250–500 kcal above TDEE daily. A slow bulk minimizes fat gain while maximizing lean muscle growth.',                    tag:'Muscle Gain',    tagBg:'#FFF3E0', tagColor:'#E65100' },
    { icon:'dumbbell', bg:'#D8F3DC', title:'Prioritize protein around workouts',        desc:'Consume 25–40 g of quality protein within 2 hours of training to maximize muscle protein synthesis.',                          tag:'Performance',    tagBg:'#D8F3DC', tagColor:'#1B6B3A' },
    { icon:'nut',      bg:'#F3E5F5', title:'Add calorie-dense healthy foods',           desc:'Nuts, avocado, olive oil, and whole milk are calorie-dense without bulk — ideal for hitting targets.',                          tag:'Calorie Dense',  tagBg:'#F3E5F5', tagColor:'#6A1B9A' },
    { icon:'moon',     bg:'#E3F2FD', title:'Sleep is when muscles are built',           desc:'Aim for 7–9 hours nightly. Poor sleep elevates cortisol which actively breaks down muscle tissue.',                            tag:'Recovery',       tagBg:'#E3F2FD', tagColor:'#1565C0' },
    { didYouKnow: true, fact: 'Creatine monohydrate increases strength and lean mass gains by 5–15% when combined with resistance training.' }
  ],
  healthy: [
    { icon:'salad',    bg:'#D8F3DC', title:'Fill half your plate with vegetables',      desc:'Aim for 5 servings of non-starchy vegetables daily across a range of colors for maximum micronutrients.',                      tag:'General Health', tagBg:'#D8F3DC', tagColor:'#1B6B3A' },
    { icon:'droplets', bg:'#E3F2FD', title:'Stay hydrated throughout the day',          desc:'8–10 glasses of water daily supports metabolism, reduces false hunger signals, and aids digestion.',                           tag:'Hydration',      tagBg:'#E3F2FD', tagColor:'#1565C0' },
    { icon:'wheat',    bg:'#F3E5F5', title:'Choose whole grains over refined carbs',    desc:'Whole grains reduce the risk of type 2 diabetes and cardiovascular disease through steady blood sugar.',                       tag:'Carbohydrates',  tagBg:'#F3E5F5', tagColor:'#6A1B9A' },
    { icon:'salt',     bg:'#FCE4EC', title:'Watch your sodium intake',                  desc:'Keep below 2,300 mg/day. Season with herbs, spices, lemon juice, or garlic instead of salt.',                                  tag:'Minerals',       tagBg:'#FCE4EC', tagColor:'#880E4F' },
    { didYouKnow: true, fact: 'The Mediterranean diet is consistently ranked as one of the healthiest eating patterns in the world by nutritional scientists.' }
  ]
};

function renderNutritionTips() {
  if (!USER) return;
  const goal  = USER.goal || 'healthy';
  const tips  = TIPS_DATA[goal] || TIPS_DATA['healthy'];
  const panel = document.getElementById('nutrition-tips-panel');
  const badge = document.getElementById('tips-goal-badge');

  const goalLabels = { lose:'Lose Weight', maintain:'Maintain Weight', gain:'Gain Muscle', healthy:'Eat Healthier' };
  badge.textContent = '🎯 ' + (goalLabels[goal] || 'Your Goal');
  panel.querySelectorAll('.tip-card, .did-you-know').forEach(el => el.remove());

  tips.forEach(tip => {
    if (tip.didYouKnow) {
      const dyk       = document.createElement('div');
      dyk.className   = 'did-you-know';
      dyk.innerHTML   = `<strong>Did you know?</strong>${tip.fact}`;
      panel.appendChild(dyk);
    } else {
      const card      = document.createElement('div');
      card.className  = 'tip-card';
      card.innerHTML  = `
        <div class="tip-icon" style="background:${tip.bg}">
          <i data-lucide="${tip.icon}" width="18" height="18" style="color:${tip.tagColor}"></i>
        </div>
        <div class="tip-body">
          <p class="tip-title">${tip.title}</p>
          <p class="tip-desc">${tip.desc}</p>
          <span class="tip-tag" style="background:${tip.tagBg};color:${tip.tagColor}">${tip.tag}</span>
        </div>`;
      panel.appendChild(card);
    }
  });
  if (window.lucide) lucide.createIcons();
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

  document.getElementById('prof-avatar-initials').textContent = getInitials(USER);
  document.getElementById('prof-name').textContent  = USER.fname + ' ' + USER.lname;
  document.getElementById('prof-email').textContent = USER.email;
  document.getElementById('prof-bmi').textContent   = calcBMI(USER.height, USER.weight);
  document.getElementById('prof-wt').textContent    = USER.weight;
  document.getElementById('prof-ht').textContent    = USER.height;
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
  document.getElementById('nav-avatar').textContent    = init;
  document.getElementById('burger-avatar').textContent = init;
  document.getElementById('burger-name').textContent   = USER.fname + ' ' + USER.lname;
  updateDashboard();
  loadProfileForm();
  showToast('Profile saved successfully!');
}

// =============================================================================
// INIT
// =============================================================================
initTheme();

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
window.generateAIAdvice       = generateAIAdvice;
window.checkPassStrength      = checkPassStrength;
window.checkPassMatch         = checkPassMatch;
window.checkGmail             = checkGmail;
window.togglePass             = togglePass;
window.toggleTheme            = toggleTheme;
window.openBurger             = openBurger;
window.closeBurger            = closeBurger;
window.openTerms              = openTerms;
window.closeTerms             = closeTerms;
window.acceptTerms            = acceptTerms;
window.otpMove                = otpMove;
window.otpBack                = otpBack;
window.verifyOTP              = verifyOTP;
window.resendOTP              = resendOTP;
window.closeOTP               = closeOTP;
window.handleProfilePic       = handleProfilePic;
window.handleFoodPhoto        = handleFoodPhoto;
window.handlePhotoDrop        = handlePhotoDrop;
window.clearFoodPhoto         = clearFoodPhoto;
