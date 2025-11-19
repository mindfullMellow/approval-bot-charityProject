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
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');
    :root { --brand-color: #13a4ec; }
    body { font-family: 'lato', Arial, sans-serif !important; color: var(--brand-color) !important; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f3f4; font-family: 'lato', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="background-color: #13a4ec; padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Welcome Aboard</h1>
    </div>
    <div style="padding: 40px 30px; color: #111618;">
      <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${name}</strong>,</p>
      <p style="font-size: 16px; line-height: 1.6;">We are pleased to inform you that your application has been reviewed and <strong>approved</strong>.</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #13a4ec;">
        <p style="margin: 5px 0; font-size: 15px;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0; font-size: 15px;"><strong>Temp Password:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; color: #d63384; font-size: 1.1em;">${tempPassword}</code></p>
      </div>
      <p style="font-size: 16px; line-height: 1.6;">Please log in immediately to update your password.</p>
      <div style="text-align: center; margin-top: 30px;">
        <a href="https://charity-project-two-chi.vercel.app/sign-in" style="background-color: #13a4ec; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: 600; display: inline-block;">Login to Dashboard</a>
      </div>
    </div>
    <div style="border-top: 1px solid #eeeeee; padding: 20px; text-align: center; color: #888888; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} One-Life Org. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: { name: 'Admin Team', address: adminEmail },
    to: email,
    subject: 'Your Account is Approved',
    html: htmlContent
  });
}

async function sendDisapprovalEmail(email, name) {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #d9534f;">Application Update</h2>
      <p>Dear ${name},</p>
      <p>We regret to inform you that your application has not been approved at this time.</p>
      <p>Best regards,<br>Admin Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: { name: 'Admin Team', address: adminEmail },
    to: email,
    subject: 'Application Disapproved',
    html: htmlContent
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
    // ✅ FIX 1: Correct String Splitting
    const firstUnderscoreIndex = callback.data.indexOf('_');
    const action = callback.data.substring(0, firstUnderscoreIndex);
    const appId = callback.data.substring(firstUnderscoreIndex + 1);

    console.log('✅ Parsed action:', action);
    console.log('✅ Parsed appId:', appId);

    if (!action || !appId) {
      console.log('❌ Invalid callback data format.');
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

      // ✅ FIX 2: Truncate Name to prevent TOO_LONG error
      const safeName = (userData.name || 'User').substring(0, 100);
      // Also safe check phone number to prevent INVALID_PHONE errors
      const safePhone = userData['phone-no'] && userData['phone-no'].length < 20 ? userData['phone-no'] : undefined;

      // Create Firebase Auth user
      console.log('🔐 Creating Firebase Auth user...');
      const userRecord = await admin.auth().createUser({
        email: userData.email,
        password: tempPassword,
        displayName: safeName,
        phoneNumber: safePhone,
      });
      console.log('✅ Firebase Auth user created. UID:', userRecord.uid);

      // Move full data to users collection (Using your updated structure)
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
          'key-achivements': [],
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