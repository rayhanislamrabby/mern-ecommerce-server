const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// stripe kye

const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
// mongodb kye

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gdoalz6.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("ecommerceDb");

    const productsCollection = db.collection("products");
    const cartCollection = db.collection("addCard");
    const orderCollection = db.collection("orders");
    const couponCollection = db.collection("coupons");

    // Product Fetch Route
    app.get("/products", async (req, res) => {
      try {
        const result = await productsCollection
          .find()
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching products", error });
      }
    });

    app.get("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await productsCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Product not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Backend Error:", error);
        res
          .status(500)
          .send({ message: "Internal Server Error", error: error.message });
      }
    });

    // --- Product Post API ---
    app.post("/products", async (req, res) => {
      const product = req.body;

      if (!product.name || !product.price) {
        return res
          .status(400)
          .send({ message: "Product name and price are required" });
      }

      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    app.patch("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updatedDoc = req.body;

        delete updatedDoc._id;

        const result = await productsCollection.updateOne(filter, {
          $set: updatedDoc,
        });

        if (result.modifiedCount > 0 || result.matchedCount > 0) {
          res.send(result);
        } else {
          res
            .status(404)
            .send({ message: "Product not found or no change made" });
        }
      } catch (error) {
        console.error("Update Error:", error);
        res
          .status(500)
          .send({ message: "Internal Server Error", error: error.message });
      }
    });

    // Product Delete API
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    // Card calloctions

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID Format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await cartCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error" });
      }
    });

    // admin cupon code api

    app.post("/admin/add-coupon", async (req, res) => {
      const newCoupon = req.body;

      newCoupon.usedCount = 0;
      const result = await couponCollection.insertOne(newCoupon);
      res.send(result);
    });

    // --- Coupon Validation API ---
    app.get("/coupons/:code", async (req, res) => {
      try {
        const code = req.params.code;
        const purchaseAmount = parseFloat(req.query.amount);

        const coupon = await couponCollection.findOne({
          code: code,
          isActive: true,
        });

        // 1. Check if coupon exists
        if (!coupon) {
          return res.status(404).send({ message: "Invalid Coupon Code!" });
        }

        // 2. Check Expiry Date
        const currentDate = new Date();
        const expiryDate = new Date(coupon.expiryDate);
        if (currentDate > expiryDate) {
          return res.status(400).send({ message: "This coupon has expired!" });
        }

        // 3. Check Usage Limit
        if (coupon.usedCount >= coupon.usageLimit) {
          return res
            .status(400)
            .send({ message: "Coupon usage limit reached!" });
        }

        // 4. Check Minimum Purchase Amount
        if (purchaseAmount < coupon.minPurchase) {
          return res.status(400).send({
            message: `Minimum purchase of ৳${coupon.minPurchase} required for this coupon!`,
          });
        }

        // Everything is OK - return discount details
        res.send({
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          message: "Coupon applied successfully!",
        });
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // 2. GET ALL COUPONS FOR ADMIN (GET)

    app.get("/admin/coupons", async (req, res) => {
      try {
        const result = await couponCollection
          .find()
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // 3. DELETE COUPON (DELETE)

    app.delete("/admin/coupons/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await couponCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Delete failed" });
      }
    });

    // 4. UPDATE COUPON DETAILS (PATCH)

    app.patch("/admin/coupons/update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            code: req.body.code.toUpperCase(),
            discountValue: req.body.discountValue,
            minPurchase: req.body.minPurchase,
            expiryDate: req.body.expiryDate,
            isActive: req.body.isActive,
          },
        };
        const result = await couponCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update failed" });
      }
    });

    // 5. TOGGLE STATUS ONLY (PATCH)

    app.patch("/admin/coupons/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: { isActive: req.body.isActive },
        };
        const result = await couponCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Status update failed" });
      }
    });

    // 6. VERIFY & APPLY COUPON

    app.get("/coupons/:code", async (req, res) => {
      try {
        const code = req.params.code.toUpperCase();
        const amount = parseFloat(req.query.amount);

        const coupon = await couponCollection.findOne({ code, isActive: true });

        if (!coupon)
          return res
            .status(404)
            .send({ message: "Invalid or Inactive Coupon" });

        // Expiry date check
        if (new Date(coupon.expiryDate) < new Date()) {
          return res.status(400).send({ message: "Coupon has expired!" });
        }

        // Usage limit check
        if (coupon.usedCount >= coupon.usageLimit) {
          return res.status(400).send({ message: "Usage limit reached!" });
        }

        // Min purchase check
        if (amount < coupon.minPurchase) {
          return res.status(400).send({
            message: `Minimum purchase ৳${coupon.minPurchase} required`,
          });
        }

        res.send(coupon);
      } catch (error) {
        res.status(500).send({ message: "Server error" });
      }
    });

    // Order Save API
    app.post("/orders", async (req, res) => {
      const order = req.body;

      try {
        // 1. Database-e order save
        const result = await orderCollection.insertOne(order);

        if (result.insertedId) {
          res.status(201).send(result);
        }
      } catch (error) {
        console.error("Order Save Error:", error);
        res.status(500).send({ message: "Failed to place order", error });
      }
    });

    // pyment intern stripe

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(price * 100),
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}
run().catch(console.dir);

// start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
