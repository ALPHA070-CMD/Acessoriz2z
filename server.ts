import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import Stripe from "stripe";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy initialization helpers
let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required.");
    }
    stripeClient = new Stripe(key, {
      apiVersion: "2025-02-24-preview" as any,
    });
  }
  return stripeClient;
}

let firebaseAdminApp: admin.app.App | null = null;
function getFirebaseAdmin() {
  if (!firebaseAdminApp) {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      firebaseAdminApp = admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    } else {
      return null;
    }
  }
  return firebaseAdminApp;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Middleware to verify admin status
  const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const firebase = getFirebaseAdmin();
    if (!firebase) {
      return res.status(500).json({ error: "Firebase Admin not initialized" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split("Bearer ")[1];
    try {
      const decodedToken = await firebase.auth().verifyIdToken(token);
      const userDoc = await firebase.firestore().collection("users").doc(decodedToken.uid).get();
      const userData = userDoc.data();
      
      if (userData?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      (req as any).user = decodedToken;
      next();
    } catch (error) {
      console.error("Admin verify error:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Products API
  app.get("/api/products", async (req, res) => {
    try {
      const firebase = getFirebaseAdmin();
      if (!firebase) throw new Error("Firebase Admin not ready");
      const snapshot = await firebase.firestore().collection("products").get();
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(products);
    } catch (error) {
      console.error("Fetch products error:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/products", verifyAdmin, async (req, res) => {
    try {
      const firebase = getFirebaseAdmin();
      if (!firebase) throw new Error("Firebase Admin not ready");
      const product = req.body;
      const docRef = await firebase.firestore().collection("products").add({
        ...product,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ id: docRef.id, ...product });
    } catch (error) {
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.put("/api/products/:id", verifyAdmin, async (req, res) => {
    try {
      const firebase = getFirebaseAdmin();
      if (!firebase) throw new Error("Firebase Admin not ready");
      const { id } = req.params;
      const product = req.body;
      await firebase.firestore().collection("products").doc(id).update({
        ...product,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ id, ...product });
    } catch (error) {
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", verifyAdmin, async (req, res) => {
    try {
      const firebase = getFirebaseAdmin();
      if (!firebase) throw new Error("Firebase Admin not ready");
      const { id } = req.params;
      await firebase.firestore().collection("products").doc(id).delete();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // Stripe Checkout
  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const stripe = getStripe();
      const { items, userId } = req.body;
      
      const lineItems = items.map((item: any) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name,
            images: [item.image],
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      }));

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${req.headers.origin}/orders?success=true`,
        cancel_url: `${req.headers.origin}/cart?canceled=true`,
        metadata: {
          userId,
        },
      });

      res.json({ id: session.id });
    } catch (error) {
      console.error("Stripe error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
