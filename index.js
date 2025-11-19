import express from 'express';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config(); // load .env

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('✅ App is running'));
app.listen(3000, () => console.log('✅ App running on port 3000'));

const adminEmail = process.env.EMAIL
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: adminEmail, pass: 'exol sbyy tjgm kppp' },
});

function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function sendApprovalEmail(email, name, tempPassword) {
  await transporter.sendMail({
    from: adminEmail,
    to: email,
    subject: 'Your Account is Approved',
    text: `Hello ${name},\n\nYour account is approved!\nEmail: ${email}\nTemporary Password: ${tempPassword}`
  });
}

async function sendDisapprovalEmail(email, name) {
  await transporter.sendMail({
    from: adminEmail,
    to: email,
    subject: 'Application Disapproved',
    text: `Hello ${name},\n\nWe regret to inform you that your application has been disapproved.`
  });
}

// Webhook for Telegram buttons
app.post('/telegram-webhook', async (req, res) => {
  console.log('=== WEBHOOK HIT ===');
  console.log('Full request body:', JSON.stringify(req.body, null, 2));
  console.log('Request headers:', req.headers);

  // Check if callback_query exists
  if (!req.body.callback_query) {
    console.log('❌ NO CALLBACK_QUERY in request body');
    console.log('Body keys:', Object.keys(req.body));
    return res.sendStatus(200);
  }

  const callback = req.body.callback_query;
  console.log('✅ CALLBACK_QUERY found:', JSON.stringify(callback, null, 2));

  // Check if callback has data
  if (!callback.data) {
    console.log('❌ NO DATA in callback_query');
    return res.sendStatus(200);
  }

  console.log('✅ Callback data:', callback.data);

  try {
    // Parse the action and appId
    const action = callback.data.split('_')[0];
    const appId = callback.data.substring(action.length + 1);
    console.log('✅ Parsed action:', action);
    console.log('✅ Parsed appId:', appId);

    if (!action || !appId) {
      console.log('❌ Invalid callback data format. Expected: action_appId');
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callback.id,
          text: '❌ Invalid data format'
        })
      });
      return res.sendStatus(200);
    }

    // Fetch application from Firestore
    console.log('📂 Fetching application from Firestore...');
    const appRef = db.collection('applications').doc(appId);
    const appSnap = await appRef.get();

    if (!appSnap.exists) {
      console.log('❌ Application NOT FOUND in Firestore:', appId);
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callback.id,
          text: '❌ Application not found'
        })
      });
      return res.sendStatus(200);
    }

    console.log('✅ Application FOUND in Firestore');
    const appData = appSnap.data();
    console.log('Application data:', JSON.stringify(appData, null, 2));

    const userData = appData['user-details'];
    console.log('User details:', JSON.stringify(userData, null, 2));

    if (action === 'approve') {
      console.log('🟢 Starting APPROVAL process...');

      const tempPassword = generateTempPassword();
      console.log('✅ Temp password generated:', tempPassword);

      // Create Firebase Auth user
      console.log('🔐 Creating Firebase Auth user...');
      const userRecord = await admin.auth().createUser({
        email: userData.email,
        password: tempPassword,
        displayName: userData.name,
        phoneNumber: userData['phone-no'] || undefined,
      });
      console.log('✅ Firebase Auth user created. UID:', userRecord.uid);

      // Move full data to users collection
      console.log('📝 Moving data to users collection...');
      await db.collection('users').doc(userRecord.uid).set({
        'user-details': {
          name: userData.name,
          country: userData.country,
          'phone-no': userData['phone-no'] || 'null',
          email: userData.email,
          'member-since': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          'life-time donation': '$0',
          'life-impacted': 0,
          'project-supported': 0,
          'payment-threshold': 0,
          createdAt: Date.now().toString()
        },
        'user-donation-data': {
          'user-donations': []
        },
        'user-impact-report': {
          'stories-of-change': [],
          'key-achievements': [],
          'impact-data': {}
        },
        'user-membership-details': {
          'stat-cards': [],
          'payment-details': {},
          'user-referral-details': {
            'referral-link': `onelife.org/join/${userData.name.toLowerCase().replace(/\s+/g, '-')}`,
            'friends-invited': 0,
            'active-members': 0
          }
        }
      });
      console.log('✅ User data saved to users collection');

      // Delete application
      console.log('🗑️ Deleting application from Firestore...');
      await appRef.delete();
      console.log('✅ Application deleted');

      // Send email
      console.log('📧 Sending approval email...');
      await sendApprovalEmail(userData.email, userData.name, tempPassword);
      console.log('✅ Approval email sent to:', userData.email);

      // Answer Telegram callback
      console.log('📱 Answering Telegram callback...');
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callback.id,
          text: '✅ Application Approved!'
        })
      });
      console.log('✅ Telegram callback answered');

    } else if (action === 'disapprove') {
      console.log('🔴 Starting DISAPPROVAL process...');

      // Delete application
      console.log('🗑️ Deleting application from Firestore...');
      await appRef.delete();
      console.log('✅ Application deleted');

      // Send email
      console.log('📧 Sending disapproval email...');
      await sendDisapprovalEmail(userData.email, userData.name);
      console.log('✅ Disapproval email sent to:', userData.email);

      // Answer Telegram callback
      console.log('📱 Answering Telegram callback...');
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callback.id,
          text: '✅ Application Disapproved'
        })
      });
      console.log('✅ Telegram callback answered');
    } else {
      console.log('❌ Unknown action:', action);
    }

    console.log('=== WEBHOOK COMPLETED SUCCESSFULLY ===');
    res.sendStatus(200);

  } catch (error) {
    console.error('💥 ERROR in webhook processing:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    // Try to answer the callback even on error
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: req.body.callback_query?.id,
          text: '❌ Error occurred'
        })
      });
    } catch (e) {
      console.error('Failed to answer callback on error:', e.message);
    }

    res.sendStatus(500);
  }
});
