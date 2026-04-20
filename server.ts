import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin initialized successfully.");
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
  }
}

const db = admin.apps.length > 0 ? admin.firestore() : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // NowPayments Webhook Handler (Fully Automatic)
  app.post("/api/nowpayments-webhook", express.json(), async (req, res) => {
    const npIpnKey = process.env.NOWPAYMENTS_IPN_SECRET;
    const hmac = req.headers["x-nowpayments-sig"];

    // Verify the signature to ensure it's a real payment from NowPayments
    const signature = crypto
      .createHmac("sha512", npIpnKey || "")
      .update(JSON.stringify(req.body, Object.keys(req.body).sort()))
      .digest("hex");

    if (signature !== hmac) {
      console.error("Invalid NowPayments signature.");
      return res.status(400).send("Invalid signature");
    }

    const { payment_status, order_id, price_amount } = req.body;

    // If payment is finished/confirmed, activate PRO plan
    if (payment_status === "finished" || payment_status === "confirmed") {
      const userId = order_id; // We use userId as order_id
      if (userId && db) {
        try {
          await db.collection("users").doc(userId).update({
            plan: "pro",
            isPro: true,
            planExpiresAt: admin.firestore.Timestamp.fromDate(
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`AUTOMATIC ACTIVATION: User ${userId} upgraded via NowPayments.`);
        } catch (error) {
          console.error(`Error updating user ${userId}:`, error);
        }
      }
    }

    res.json({ received: true });
  });

  app.use(express.json());

  // Create NowPayments Payment
  app.post("/api/create-payment", async (req, res) => {
    const { userId, price, plan } = req.body;
    const apiKey = process.env.NOWPAYMENTS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "NowPayments API Key missing" });
    }

    try {
      const response = await fetch("https://api.nowpayments.io/v1/payment", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          price_amount: price,
          price_currency: "usd",
          pay_currency: "usdttrc20", // Default to USDT (TRC20) for low fees
          ipn_callback_url: `${process.env.APP_URL}/api/nowpayments-webhook`,
          order_id: userId,
          order_description: `Abonimi Mjeshtri - ${plan.toUpperCase()}`,
        }),
      });

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
