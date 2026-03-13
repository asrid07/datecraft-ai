# DateCraft AI - Dating Profile Generator

AI-powered dating profile optimizer. Get more matches on Tinder, Hinge, and Bumble.

## Features

- 📝 **Bio Rewriter** - Transform boring bios into magnetic profiles
- 💬 **Conversation Starters** - Get personalized openers based on match's profile  
- 📸 **Photo Tips** - AI recommendations for your photo lineup
- 🎯 **Platform Optimized** - Tailored for Tinder, Hinge, Bumble

## Tech Stack

- Frontend: Vanilla HTML/CSS/JS
- Backend: Node.js + Express
- Database: Supabase (PostgreSQL)
- AI: Claude API (Anthropic)
- Payments: PayPal

## Setup

### 1. Database (Supabase)

1. Create a Supabase project at https://supabase.com
2. Go to SQL Editor and run `schema.sql`
3. Get your project URL and service_role key from Settings > API

### 2. Backend

```bash
cd dateprofile-ai
npm install
cp .env.example .env
# Fill in your .env values
npm run dev
```

### 3. Frontend

1. Update `API_URL` in `index.html` to your backend URL
2. Deploy to Vercel or open locally

### 4. PayPal (Optional)

1. Create PayPal Developer account
2. Create subscription plans for Pro tier
3. Add credentials to .env

## Deployment

### Backend → Railway

1. Push to GitHub
2. Connect to Railway
3. Add environment variables
4. Deploy

### Frontend → Vercel

1. Update `API_URL` in index.html to Railway URL
2. Push to GitHub
3. Import to Vercel
4. Deploy

## Credits

- Dev: Asrid
- AI: Claude by Anthropic
