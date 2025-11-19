import express from 'express';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('✅ App is running'));
app.listen(3000, () => console.log('✅ App running on port 3000'));

const adminEmail = process.env.EMAIL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: adminEmail, pass: 'exol sbyy tjgm kppp' },
});

function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ✅ UPDATED: Corporate Email with Google Fonts
async function sendApprovalEmail(email, name, tempPassword) {
  const htmlContent = ` <!DOCTYPE html>
<html>

<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link
    href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Raleway:ital,wght@0,100..900;1,100..900&display=swap"
    rel="stylesheet">
  <style>
    /* Import font for clients that support it */
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');

    :root {
      --brand-color: #13a4ec;
    }

    body {
      font-family: 'lato', Arial, sans-serif !important;
      color: var(--brand-color) !important;
    }
  </style>
</head>

<body style="margin: 0; padding: 0; background-color: #f0f3f4; font-family: 'lato', Arial, sans-serif;">
  <div
    style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background-color: #13a4ec; padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Welcome Aboard</h1>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px; color: #111618;">
      <p style="font-size: 16px; line-height: 1.6;">Dear <strong>${name}</strong>,</p>

      <p style="font-size: 16px; line-height: 1.6;">We are pleased to inform you that your application has been reviewed
        and <strong>approved</strong>. You may now access your account using the credentials below.</p>

      <!-- Credentials Box -->
      <div
        style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #13a4ec;">
        <p style="margin: 5px 0; font-size: 15px;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0; font-size: 15px;"><strong>Temp Password:</strong> <code
            style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; color: #d63384; font-size: 1.1em;">${tempPassword}</code>
        </p>
      </div>

      <p style="font-size: 16px; line-height: 1.6;">Please log in immediately to update your password and complete your
        profile setup.</p>

      <div style="text-align: center; margin-top: 30px;">
        <a href="https://charity-project-two-chi.vercel.app/sign-in"
          style="background-color: #13a4ec; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: 600; display: inline-block;">Login
          to Dashboard</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #eeeeee; padding: 20px; text-align: center; color: #888888; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} One-Life Org. All rights reserved.</p>
    </div>
  </div>
</body>

</html> `;

  await transporter.sendMail({
    from: { name: 'Admin Team', address: adminEmail }, // Adds a professional sender name
    to: email,
    subject: '✅ Account Approved - Access Details',
    html: htmlContent,
  });
}

async function sendDisapprovalEmail(email, name) {
  // Basic HTML for disapproval to match style slightly
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #d9534f;">Application Update</h2>
      <p>Dear ${name},</p>
      <p>We regret to inform you that your application has not been approved at this time.</p>
      <p>Best regards,<br>Admin Team</p>
    </div>
  `;

  transporter.sendMail({
    from: { name: 'Admin Team', address: adminEmail },
    to: email,
    subject: 'Application Status Update',
    html: htmlContent
  });
}

app.post('/telegram-webhook', async (req, res) => {
  // Simple logging
  if (!req.body.callback_query) return res.sendStatus(200);

  const callback = req.body.callback_query;
  if (!callback.data) return res.sendStatus(200);

  try {
    // ✅ FIX 1: Correct splitting logic
    // Splits at the first underscore only
    const firstUnderscoreIndex = callback.data.indexOf('_');
    const action = callback.data.substring(0, firstUnderscoreIndex);
    const appId = callback.data.substring(firstUnderscoreIndex + 1);

    console.log(`Processing: Action [${action}] | ID [${appId}]`);

    if (!action || !appId) {
      console.log('❌ Parse error');
      return res.sendStatus(200);
    }

    const appRef = db.collection('applications').doc(appId);
    const appSnap = await appRef.get();

    if (!appSnap.exists) {
      console.log('❌ App not found in DB');
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback.id, text: '❌ Application not found' })
      });
      return res.sendStatus(200);
    }

    const appData = appSnap.data();
    const userData = appData['user-details'];

    if (action === 'approve') {
      const tempPassword = generateTempPassword();

      // ✅ FIX 2: Prevent TOO_LONG error
      // Truncate name to 100 chars and handle missing phone numbers
      const safeName = (userData.name || 'User').substring(0, 100);
      const safePhone = userData['phone-no'] && userData['phone-no'].length < 20 ? userData['phone-no'] : undefined;

      console.log('🔐 Creating Auth user...');
      const userRecord = await admin.auth().createUser({
        email: userData.email,
        password: tempPassword,
        displayName: safeName,
        phoneNumber: safePhone,
      });

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

      await appRef.delete();
      await sendApprovalEmail(userData.email, userData.name, tempPassword);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback.id, text: '✅ Approved!' })
      });

    } else if (action === 'disapprove') {
      await appRef.delete();
      await sendDisapprovalEmail(userData.email, userData.name);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback.id, text: '✅ Disapproved' })
      });
    }

    res.sendStatus(200);

  } catch (error) {
    console.error('💥 Processing Error:', error.message);
    // Attempt to notify Telegram of error
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: req.body.callback_query?.id, text: '❌ Error Processing' })
      });
    } catch (e) { }
    res.sendStatus(500);
  }
});