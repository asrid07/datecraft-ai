// DateCraft AI Backend
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'datecraft-secret-key-change-me';
const FREE_CREDITS = 3; // 3 free credits for DateCraft

// Debug: Log env vars on startup
console.log('ENV CHECK:', {
  SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'SET' : 'MISSING',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING'
});

// Supabase - with validation
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Missing Supabase credentials. Check environment variables.');
  console.error('SUPABASE_URL:', process.env.SUPABASE_URL);
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Claude API
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// PayPal
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API = process.env.NODE_ENV === 'production' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get fresh user data
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ─────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be 6+ characters' });
    }
    
    // Check if exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .or(`username.eq.${username},email.eq.${email}`)
      .single();
    
    if (existing) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    // Hash password
    const hash = await bcrypt.hash(password, 10);
    
    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        username,
        email,
        password_hash: hash,
        credits: FREE_CREDITS,
        plan: 'free'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        credits: user.credits,
        plan: user.plan
      }
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    
    if (!login || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${login},email.eq.${login}`)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        credits: user.credits,
        plan: user.plan
      }
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────
// AI GENERATION ROUTE
// ─────────────────────────────────────────
app.post('/ai/generate', authMiddleware, async (req, res) => {
  try {
    const { messages, system, max_tokens, action } = req.body;
    const user = req.user;
    
    // Check credits (unless unlimited plan)
    if (user.plan !== 'pro' && user.plan !== 'unlimited') {
      if (user.credits <= 0) {
        return res.status(402).json({ error: 'No credits remaining', credits: 0 });
      }
    }
    
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1024,
        system: system || 'You are a helpful assistant.',
        messages: messages
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Claude API error');
    }
    
    const result = await response.json();
    
    // Deduct credit (unless unlimited plan)
    let newCredits = user.credits;
    if (user.plan !== 'pro' && user.plan !== 'unlimited') {
      const { data: updated, error } = await supabase
        .from('users')
        .update({ credits: user.credits - 1 })
        .eq('id', user.id)
        .select('credits')
        .single();
      
      if (error) throw error;
      newCredits = updated.credits;
    }
    
    // Log usage
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      action: action || 'generation',
      credits_used: 1
    });
    
    res.json({
      result: result,
      credits: newCredits
    });
  } catch (e) {
    console.error('AI generation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────
// CREDITS ROUTES
// ─────────────────────────────────────────
app.get('/credits', authMiddleware, async (req, res) => {
  res.json({ credits: req.user.credits, plan: req.user.plan });
});

app.post('/credits/add', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    
    const { data: updated, error } = await supabase
      .from('users')
      .update({ credits: req.user.credits + amount })
      .eq('id', req.user.id)
      .select('credits')
      .single();
    
    if (error) throw error;
    
    res.json({ credits: updated.credits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────
// PAYPAL ROUTES
// ─────────────────────────────────────────
async function getPayPalToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  return data.access_token;
}

// Create order for one-time credits purchase
app.post('/paypal/create-order', authMiddleware, async (req, res) => {
  try {
    const { amount, credits } = req.body;
    const token = await getPayPalToken();
    
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: amount.toString()
          },
          description: `DateCraft AI - ${credits} Credits`
        }]
      })
    });
    
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Capture order
app.post('/paypal/capture-order', authMiddleware, async (req, res) => {
  try {
    const { orderID, credits } = req.body;
    const token = await getPayPalToken();
    
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.status === 'COMPLETED') {
      // Add credits
      const { data: updated, error } = await supabase
        .from('users')
        .update({ credits: req.user.credits + credits })
        .eq('id', req.user.id)
        .select('credits')
        .single();
      
      if (error) throw error;
      
      // Log payment
      await supabase.from('payments').insert({
        user_id: req.user.id,
        paypal_order_id: orderID,
        amount: credits === 10 ? 19 : credits * 3,
        credits_added: credits,
        type: 'one_time'
      });
      
      res.json({ success: true, credits: updated.credits });
    } else {
      res.status(400).json({ error: 'Payment not completed' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create subscription
app.post('/paypal/create-subscription', authMiddleware, async (req, res) => {
  try {
    const { planId } = req.body;
    const token = await getPayPalToken();
    
    const response = await fetch(`${PAYPAL_API}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        plan_id: planId,
        application_context: {
          return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription-success`,
          cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription-cancel`
        }
      })
    });
    
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Activate subscription
app.post('/paypal/activate-subscription', authMiddleware, async (req, res) => {
  try {
    const { subscriptionId, plan } = req.body;
    
    const { error } = await supabase
      .from('users')
      .update({ 
        plan: plan || 'pro',
        subscription_id: subscriptionId
      })
      .eq('id', req.user.id);
    
    if (error) throw error;
    
    // Log subscription
    await supabase.from('payments').insert({
      user_id: req.user.id,
      paypal_subscription_id: subscriptionId,
      amount: plan === 'pro' ? 9 : 19,
      type: 'subscription',
      plan: plan
    });
    
    res.json({ success: true, plan: plan || 'pro' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ 
    status: 'DateCraft AI Backend Running',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 DateCraft AI backend running on port ${PORT}`);
});
