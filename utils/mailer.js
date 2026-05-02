const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications["api-key"];

apiKey.apiKey = process.env.BREVO_API_KEY;

const buildMailTemplate = ({
  title,
  subtitle,
  badge,
  content,
  buttonText,
  buttonUrl,
}) => {
  return `
  <div style="margin:0;padding:0;background:linear-gradient(135deg,#eef2ff,#fdf2f8,#ecfeff);font-family:Arial,sans-serif;">
    <div style="max-width:720px;margin:0 auto;padding:38px 18px;">

      <div style="background:linear-gradient(135deg,#111827,#4f46e5,#ec4899);border-radius:34px;padding:36px;color:white;box-shadow:0 25px 60px rgba(79,70,229,.35);position:relative;overflow:hidden;">
        
        <div style="position:absolute;top:-70px;right:-70px;width:220px;height:220px;background:radial-gradient(circle,rgba(255,255,255,.35),transparent 70%);border-radius:50%;"></div>
        <div style="position:absolute;bottom:-90px;left:-70px;width:230px;height:230px;background:radial-gradient(circle,rgba(236,72,153,.45),transparent 70%);border-radius:50%;"></div>

        <div style="position:relative;z-index:2;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
            <div style="width:46px;height:46px;border-radius:50%;background:white;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;">
              T
            </div>
            <div>
              <div style="font-size:14px;font-weight:900;letter-spacing:3px;">
                TA SHOP DU 78
              </div>
              <div style="font-size:12px;color:#e0e7ff;margin-top:3px;">
                Streetwear, sneakers et bons plans.
              </div>
            </div>
          </div>

          ${
            badge
              ? `
              <div style="display:inline-block;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.25);font-size:12px;font-weight:900;letter-spacing:1.5px;margin-bottom:18px;">
                ${badge}
              </div>
              `
              : ""
          }

          <h1 style="margin:0 0 14px;font-size:42px;line-height:1.08;font-weight:950;color:white;">
            ${title}
          </h1>

          <p style="margin:0;font-size:18px;line-height:1.5;color:#eef2ff;">
            ${subtitle}
          </p>
        </div>
      </div>

      <div style="margin-top:24px;background:rgba(255,255,255,.96);border-radius:32px;padding:34px;box-shadow:0 22px 55px rgba(15,23,42,.12);border:1px solid rgba(255,255,255,.8);">

        <div style="background:#f8fafc;border-radius:24px;padding:24px;border:1px solid #e5e7eb;color:#111827;font-size:17px;line-height:1.7;">
          ${content}
        </div>

        ${
          buttonText && buttonUrl
            ? `
            <a href="${buttonUrl}" style="display:inline-block;margin-top:28px;background:linear-gradient(135deg,#111827,#4f46e5,#ec4899);color:white;text-decoration:none;padding:16px 30px;border-radius:999px;font-weight:900;font-size:15px;box-shadow:0 16px 35px rgba(79,70,229,.35);">
              ${buttonText}
            </a>
            `
            : ""
        }
      </div>

      <div style="text-align:center;margin-top:30px;color:#64748b;font-size:13px;line-height:1.6;">
        <p style="margin:0;font-weight:800;">Merci de faire confiance à TA SHOP DU 78 ✨</p>
        <p style="margin:8px 0 0;">Email automatique — ne réponds pas directement à ce message.</p>
      </div>

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