const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications["api-key"];

apiKey.apiKey = process.env.BREVO_API_KEY;

const buildMailTemplate = ({ title, subtitle, badge, content, buttonText, buttonUrl }) => {
  return `
  <div style="margin:0;padding:0;background:linear-gradient(135deg,#eef2ff,#fdf2f8,#ecfeff);font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:36px 18px;">
      
      <div style="background:linear-gradient(135deg,#111827,#4f46e5,#ec4899);border-radius:32px;padding:34px;color:white;">
        <div style="font-size:13px;font-weight:900;letter-spacing:2px;">
          TA SHOP DU 78
        </div>

        <h1 style="margin:18px 0 8px;font-size:32px;">
          ${title}
        </h1>

        <p style="margin:0;font-size:15px;color:#e0e7ff;">
          ${subtitle}
        </p>
      </div>

      <div style="margin-top:20px;background:white;border-radius:24px;padding:26px;">
        
        ${
          badge
            ? `<div style="background:linear-gradient(135deg,#4f46e5,#ec4899);color:white;padding:8px 14px;border-radius:999px;font-weight:800;display:inline-block;margin-bottom:16px;">
                ${badge}
              </div>`
            : ""
        }

        <div style="font-size:16px;color:#111;">
          ${content}
        </div>

        ${
          buttonText
            ? `<a href="${buttonUrl}" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#111827,#4f46e5,#ec4899);color:white;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold;">
                ${buttonText}
              </a>`
            : ""
        }
      </div>
    </div>
  </div>
  `;
};

const sendMail = async ({ to, subject, html }) => {
  try {
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

    console.log("Mail envoyé :", to);
  } catch (err) {
    console.log("Erreur mail :", err.response?.body || err.message);
  }
};

module.exports = {
  sendMail,
  buildMailTemplate,
};