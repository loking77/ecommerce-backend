const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const sendMail = async ({ to, subject, html }) => {
  try {
    if (!to) return;

    await transporter.sendMail({
      from: `"TA SHOP DU 78" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log("Email envoyé à :", to);
  } catch (err) {
    console.log("Erreur envoi mail :", err.message);
  }
};

module.exports = sendMail;