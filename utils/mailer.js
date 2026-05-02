const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications["api-key"];

apiKey.apiKey = process.env.BREVO_API_KEY;

const buildMailTemplate = ({
  title = "",
  subtitle = "",
  badge = "",
  content = "",
  buttonText = "",
  buttonUrl = "",
}) => {
  return `
  <div style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#111827,#4f46e5,#ec4899);border-radius:22px;padding:22px;color:white;">
        <div style="font-size:13px;font-weight:900;letter-spacing:2px;">TA SHOP DU 78</div>
        ${badge ? `<div style="display:inline-block;margin-top:14px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.18);font-size:11px;font-weight:800;">${badge}</div>` : ""}
        <h1 style="margin:16px 0 8px;font-size:26px;line-height:1.15;">${title}</h1>
        <p style="margin:0;font-size:14px;color:#e0e7ff;">${subtitle}</p>
      </div>

      <div style="margin-top:16px;background:white;border-radius:20px;padding:22px;box-shadow:0 12px 30px rgba(15,23,42,.10);">
        <div style="background:#f8fafc;border-radius:16px;padding:16px;color:#111827;font-size:15px;line-height:1.6;">
          ${content}
        </div>

        ${
          buttonText && buttonUrl
            ? `<a href="${buttonUrl}" style="display:inline-block;margin-top:18px;background:linear-gradient(135deg,#111827,#4f46e5,#ec4899);color:white;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:900;font-size:14px;">
                ${buttonText}
              </a>`
            : ""
        }
      </div>

      <p style="text-align:center;margin-top:16px;color:#64748b;font-size:12px;">
        Merci de faire confiance à TA SHOP DU 78 ✨
      </p>
    </div>
  </div>
  `;
};

const sendMail = async ({ to, subject, html }) => {
  try {
    if (!to) return console.log("Mail non envoyé : destinataire manquant");
    if (!process.env.BREVO_API_KEY) return console.log("BREVO_API_KEY manquante");
    if (!process.env.EMAIL_FROM) return console.log("EMAIL_FROM manquant");

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

module.exports = {
  sendMail,
  buildMailTemplate,
};