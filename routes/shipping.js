const express = require("express");
const router = express.Router();

router.get("/rates", (req, res) => {
  res.json([
    {
      carrier: "Colissimo",
      service: "Livraison domicile",
      price: 6.99,
      delay: "48h"
    },
    {
      carrier: "Mondial Relay",
      service: "Point relais",
      price: 4.49,
      delay: "3-5 jours"
    },
    {
      carrier: "Chronopost",
      service: "Express",
      price: 12.99,
      delay: "24h"
    }
  ]);
});

module.exports = router;