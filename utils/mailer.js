const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications["api-key"];

apiKey.apiKey = process.env.BREVO_API_KEY;

const sendMail = async ({ to, subject, html }) => {
  try {
    if (!to) {
      console.log("Mail non envoyé : destinataire manquant");
      return;
    }

    if (!process.env.BREVO_API_KEY) {
      console.log("Mail non envoyé : BREVO_API_KEY manquante");
      return;
    }

    if (!process.env.EMAIL_FROM) {
      console.log("Mail non envoyé : EMAIL_FROM manquant");
      return;
    }

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    await apiInstance.sendTransacEmail({
      sender: {
        email: process.env.EMAIL_FROM,
        name: "TA SHOP DU 78",
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });

    console.log("Mail Brevo envoyé à :", to);
  } catch (err) {
    console.log("Erreur mail Brevo :", err.response?.body || err.message);
  }
};

module.exports = sendMail;