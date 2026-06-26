#  SmartBite — Your Nutrition Companion

> An intelligent, AI-powered nutrition tracking web app that helps you log meals, analyze food, track your BMI, and receive personalized health advice — all in one place.

---

##  Live Demo

 [smart-bite-two.vercel.app](https://smart-bite-two.vercel.app)

---

##  Features

###  Authentication
- Email & password registration with **confirm password** validation
- **Password strength meter** (Weak → Fair → Good → Strong)
- **OTP email verification** via EmailJS — a 6-digit code is sent to the user's inbox before the account is created
- **Terms of Service & Privacy Policy** agreement required at registration
- Secure sign-in and logout powered by **Firebase Authentication**

###  Dashboard
- Personalized greeting based on time of day
- **BMI calculator** with category badge (Underweight / Normal / Overweight / Obese)
- **Daily calorie tracker** with visual progress bar vs. your calorie goal
- Stats cards: Foods logged today, Healthy food ratio, Logging streak
- Recent food log chips with color-coded health ratings
- **Smart Recommendations** — dynamic tips based on your BMI, calorie intake, and food choices

###  Food Log
- Log any meal with food name, estimated calories, and meal type (Breakfast / Lunch / Dinner / Snack)
- **AI-powered food analysis** via Claude API — get instant rating (Healthy / Moderate / Unhealthy), calorie estimate, nutrient highlights, and a personalized tip
- Delete individual food entries
- Today's log displayed in real time

###  Smart Advice
- **Daily Goals Progress** — calorie, healthy food ratio, and meals logged bars
- **Weekly Insights** — AI-generated coaching based on your recent food history
- **Nutrition Tips Panel** — goal-based static tip cards that update automatically when your goal changes:
  -  Lose Weight
  -  Maintain Weight
  -  Gain Muscle
  -  Eat Healthier
- "Did you know?" fact card at the bottom of each goal set

###  Profile & Settings
- Edit personal info: name, age, gender
- Update body metrics: height, weight
- Change primary goal and daily calorie target
- BMI, weight, and height displayed on profile card
- Changes saved instantly to Firestore

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore (Firebase) |
| AI Analysis | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Email OTP | EmailJS |
| Hosting | Vercel |

---

##  Project Structure

```
smartbite/
├── index.html       # Main HTML — all pages, OTP overlay, Terms modal
├── app.js           # All app logic — auth, food log, AI, OTP, tips
├── style.css        # All styles — layout, components, animations
└── README.md        # This file
```

---

##  Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/your-username/smartbite.git
cd smartbite
```

### 2. Configure Firebase
Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com) and replace the config in `app.js`:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

### 3. Configure EmailJS
Sign up at [emailjs.com](https://emailjs.com) and create a template with these variables:

| Variable | Description |
|---|---|
| `{{to_email}}` | Recipient's email (To Email field) |
| `{{to_name}}` | User's first name |
| `{{otp_code}}` | The 6-digit verification code |

Then update the constants in `app.js`:

```js
const EMAILJS_SERVICE_ID  = 'your_service_id';
const EMAILJS_TEMPLATE_ID = 'your_template_id';
const EMAILJS_PUBLIC_KEY  = 'your_public_key';
```

### 4. Add the EmailJS SDK to `index.html`
```html
<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
```

### 5. Enable Firestore
In Firebase Console → Firestore Database → Create database → Start in test mode.

### 6. Deploy to Vercel
```bash
npm install -g vercel
vercel
```

Or simply drag and drop your project folder into [vercel.com](https://vercel.com).

---

##  Environment Notes

> **Important:** This project calls the Anthropic Claude API directly from the browser for food analysis and weekly insights. For production use, it is strongly recommended to proxy these requests through a backend server to keep your API key secure.

---

##  OTP Flow

```
User fills registration form
        ↓
Validation checks (passwords match, terms agreed)
        ↓
generateOTPCode() → random 6-digit code
        ↓
sendOTPEmail() → EmailJS sends code to user's inbox
        ↓
OTP overlay appears → user enters code
        ↓
verifyOTP() → checks code + expiry (10 minutes)
        ↓
 Firebase account created + profile saved to Firestore
```

---

##  Goal-Based Nutrition Tips

SmartBite shows different tip cards depending on the user's selected goal:

| Goal | Tips Focus |
|---|---|
| Lose Weight | Calorie deficit, protein, hydration, whole grains |
| Maintain Weight | Energy balance, food variety, meal timing |
| Gain Muscle | Calorie surplus, protein timing, calorie-dense foods, recovery |
| Eat Healthier | Vegetables, hydration, whole grains, sodium |

---

##  Credits

- **AI Analysis** — [Anthropic Claude](https://anthropic.com)
- **Authentication & Database** — [Firebase by Google](https://firebase.google.com)
- **Email OTP** — [EmailJS](https://emailjs.com)
- **Fonts** — [DM Sans & DM Serif Display](https://fonts.google.com)
- **Hosting** — [Vercel](https://vercel.com)

---

## 📄 License

This project is for educational and personal use. All rights reserved © 2026 SmartBite.
