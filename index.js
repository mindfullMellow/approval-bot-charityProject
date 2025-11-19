import express from 'express';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('✅ App is running'));
app.listen(3000, () => console.log('✅ App running on port 3000'));

const adminEmail = 'justonelifeorg@gmail.com'
const TELEGRAM_CHAT_ID = '5081315710'
const TELEGRAM_BOT_TOKEN = '8308377370:AAH6dWzJ9AiC2Z6GHE2V5Ka3bPy_dxhbdnc'

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: adminEmail , pass: 'exol sbyy tjgm kppp' },
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
   console.log('Webhook hit! Raw body:', req.body)

  const callback = req.body.callback_query;
  if (!callback) {
console.log('No ca0llBack query Found')
return res.sendStatus(200)
};

console.log('Callback recieved:', callback);

  const [action, appId] = callback.data.split('_');
  const appRef = db.collection('applications').doc(appId);
  const appSnap = await appRef.get();
  if (!appSnap.exists) return res.sendStatus(200);

  const appData = appSnap.data();
  const userData = appData['user-details'];

  if (action === 'approve') {
    const tempPassword = generateTempPassword();

    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email: userData.email,
      password: tempPassword,
      displayName: userData.name,
      phoneNumber: userData['phone-no'] || undefined,
    });

    // Move full data to users collection
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: userData.email,
      name: userData.name,
      country: userData.country,
      phone: userData['phone-no'],
      tempPassword,
      memberSince: new Date(),
      lifetimeDonation: '$0',
      lifetimeImpacted: 0,
      projectsSupported: 0,
      paymentThreshold: 0,
      ...userData
    });

    await appRef.delete();
    await sendApprovalEmail(userData.email, userData.name, tempPassword);

  } else if (action === 'disapprove') {
    await appRef.delete();
    await sendDisapprovalEmail(userData.email, userData.name);
  }

  // Answer Telegram callback
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callback.id, text: '✅ Done' })
  });

  res.sendStatus(200);

     // Example: just reply to user
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ callback_query_id: callback.id, text: `You clicked: ${action}` })
  });

  res.sendStatus(200);

});

app.listen(3000, () => console.log('✅ Telegram approval webhook running'));
