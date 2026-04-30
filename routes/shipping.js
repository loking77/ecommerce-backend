const express = require("express");
const router = express.Router();
const axios = require("axios");

console.log("🔥 SHIPPING BACKEND ROUTE ACTIVE");

/* ---------------- BOXTAL TOKEN ---------------- */

const getToken = async () => {
  const res = await axios.post(
    "https://api.boxtal.com/api/v3/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.BOXTAL_ACCESS_KEY,
      client_secret: process.env.BOXTAL_SECRET_KEY,
    })
  );

  return res.data.access_token;
};

/* ---------------- FALLBACK RATES ---------------- */

const fallbackRates = [
  {
    carrier: "Colissimo",
    service: "Livraison domicile",
    price: 6.99,
    delay: "48h",
    type: "delivery",
  },
  {
    carrier: "Mondial Relay",
    service: "Point relais",
    price: 4.49,
    delay: "3-5 jours",
    type: "delivery",
  },
  {
    carrier: "Chronopost",
    service: "Express",
    price: 12.99,
    delay: "24h",
    type: "delivery",
  },
];

/* ---------------- SHIPPING RATES ---------------- */

router.get("/rates", async (req, res) => {
  const pickupOption = {
    carrier: "Retrait en main propre",
    service: "Poissy (78)",
    price: 0,
    delay: "Aujourd’hui ou sur rendez-vous",
    type: "pickup",
  };

  try {
    let boxtalRates = [];

    try {
      const token = await getToken();

      const shipment = {
        shipper_address: {
          zip_code: "78300",
          country: "FR",
        },
        receiver_address: {
          zip_code: req.query.zip || "75001",
          country: "FR",
        },
        parcels: [
          {
            weight: Number(req.query.weight || 1),
            length: 20,
            width: 20,
            height: 10,
          },
        ],
      };

      const response = await axios.post(
        "https://api.boxtal.com/api/v3/shipping_offers",
        shipment,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const offers = Array.isArray(response.data)
        ? response.data
        : response.data?.offers || [];

      boxtalRates = offers
        .map((offer) => ({
          carrier:
            offer.carrier ||
            offer.carrier_name ||
            offer.operator ||
            "Transporteur",
          service:
            offer.service ||
            offer.service_name ||
            offer.product_name ||
            "Livraison",
          price:
            Number(
              offer.price?.total_price_with_vat ||
                offer.price?.total ||
                offer.total_price_with_vat ||
                offer.total_price ||
                0
            ) || 0,
          delay:
            offer.delivery?.date ||
            offer.delivery_date ||
            offer.delay ||
            "Standard",
          type: "delivery",
        }))
        .filter((rate) => rate.price > 0);

      if (boxtalRates.length === 0) {
        boxtalRates = fallbackRates;
      }
    } catch (err) {
      console.log("Boxtal erreur non bloquante :", err.response?.data || err.message);
      boxtalRates = fallbackRates;
    }

    res.json([pickupOption, ...boxtalRates]);
  } catch (err) {
    console.log("ERREUR SHIPPING :", err.message);
    res.json([pickupOption, ...fallbackRates]);
  }
});

module.exports = router;
