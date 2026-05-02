const buildMailTemplate = ({
  title,
  subtitle,
  badge,
  content,
  buttonText,
  buttonUrl,
}) => {
  return `
  <div style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:20px;">

      <!-- HEADER -->
      <div style="
        background:linear-gradient(135deg,#4f46e5,#ec4899);
        border-radius:20px;
        padding:20px;
        color:white;
        position:relative;
        overflow:hidden;
      ">

        <div style="
          position:absolute;
          top:-40px;
          right:-40px;
          width:120px;
          height:120px;
          background:radial-gradient(circle,rgba(255,255,255,0.3),transparent);
          border-radius:50%;
        "></div>

        <!-- LOGO -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="
            width:36px;
            height:36px;
            border-radius:50%;
            background:white;
            color:#4f46e5;
            display:flex;
            align-items:center;
            justify-content:center;
            font-weight:bold;
          ">
            T
          </div>

          <div>
            <div style="font-size:13px;font-weight:700;">TA SHOP DU 78</div>
            <div style="font-size:11px;color:#e0e7ff;">Streetwear & sneakers</div>
          </div>
        </div>

        ${
          badge
            ? `
            <div style="
              display:inline-block;
              padding:4px 10px;
              border-radius:999px;
              background:rgba(255,255,255,0.2);
              font-size:10px;
              margin-bottom:10px;
            ">
              ${badge}
            </div>
            `
            : ""
        }

        <h2 style="margin:0;font-size:22px;font-weight:800;">
          ${title}
        </h2>

        <p style="margin:5px 0 0;font-size:13px;color:#eef2ff;">
          ${subtitle}
        </p>

      </div>

      <!-- CONTENT -->
      <div style="
        background:white;
        border-radius:18px;
        padding:20px;
        margin-top:15px;
        box-shadow:0 10px 25px rgba(0,0,0,0.08);
      ">
        <div style="
          background:#f8fafc;
          border-radius:14px;
          padding:15px;
          font-size:14px;
          color:#111;
        ">
          ${content}
        </div>

        ${
          buttonText
            ? `
            <a href="${buttonUrl}" style="
              display:inline-block;
              margin-top:15px;
              padding:12px 20px;
              border-radius:999px;
              background:linear-gradient(135deg,#111827,#4f46e5,#ec4899);
              color:white;
              text-decoration:none;
              font-size:13px;
              font-weight:700;
            ">
              ${buttonText}
            </a>
            `
            : ""
        }
      </div>

      <!-- FOOTER -->
      <div style="text-align:center;margin-top:15px;font-size:11px;color:#777;">
        Merci pour ta confiance 💜
      </div>

    </div>
  </div>
  `;
};