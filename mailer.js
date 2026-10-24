const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

function notifyAdmin(subject, text) {
  resend.emails.send({
    from: 'onboarding@resend.dev',
    to: process.env.ADMIN_EMAIL,
    subject,
    text,
  }).catch(err => console.error('Email failed to send:', err.message));
}

module.exports = { notifyAdmin };