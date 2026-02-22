const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// stripe kye
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
// mongodb kye
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gdoalz6.mongodb.net/?appName=Cluster0`;
// firebase

const decodedkye = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8",
);

const serviceAccount = JSON.parse(decodedkye);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const client = new MongoClient(uri, { 
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // conect tha client to tha sarver
    // await client.connect();

    const db = client.db("ecommerceDb");

    const productsCollection = db.collection("products");
    const cartCollection = db.collection("addCard");
    const orderCollection = db.collection("orders");
    const couponCollection = db.collection("coupons");
    const userCollection = db.collection("users");

    // custome middelwear

    const verifyFirebaseToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ message: "Unauthorized" });
      }

      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).send({ message: "Unauthorized" });
      }

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).send({ message: "Invalid Firebase token" });
      }
    };
    //  verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;

      const query = { email };

      const user = await userCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

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

    app.patch(
      "/products/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
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
      },
    );

    // Product Delete API
    app.delete(
      "/products/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await productsCollection.deleteOne(query);
        res.send(result);
      },
    );

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

    // FIRST — specific route
    app.delete("/carts/clear", async (req, res) => {
      console.log("QUERY:", req.query);

      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email missing" });
      }

      const result = await cartCollection.deleteMany({ email });
      res.send(result);
    });

    //  SECOND — dynamic route
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

    app.post(
      "/admin/add-coupon",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const newCoupon = req.body;

        newCoupon.usedCount = 0;
        const result = await couponCollection.insertOne(newCoupon);
        res.send(result);
      },
    );
    // . VERIFY & APPLY COUPON

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

    app.get(
      "/admin/coupons",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const result = await couponCollection
            .find()
            .sort({ _id: -1 })
            .toArray();
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Internal Server Error" });
        }
      },
    );

    // 3. DELETE COUPON (DELETE)

    app.delete(
      "/coupons/delete/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const result = await couponCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Delete failed" });
        }
      },
    );

    // 4. UPDATE COUPON DETAILS (PATCH)
    app.patch(
      "/admin/coupons/update/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;

          // 🔥 normalize type
          let type = (req.body.discountType || "").toLowerCase();
          if (type === "percentage") type = "percent";

          const filter = { _id: new ObjectId(id) };

          const updatedDoc = {
            $set: {
              code: req.body.code.toUpperCase(),
              discountType: type,
              discountValue: parseFloat(req.body.discountValue),
              minPurchase: parseFloat(req.body.minPurchase),
              usageLimit: parseInt(req.body.usageLimit),
              expiryDate: req.body.expiryDate,
              isActive: req.body.isActive,
            },
          };

          const result = await couponCollection.updateOne(filter, updatedDoc);
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: "Update failed" });
        }
      },
    );
    // 5. TOGGLE STATUS ONLY (PATCH)

    app.patch(
      "/admin/coupons/status/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
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
      },
    );

    // 6. VERIFY & APPLY COUPON

    app.patch(
      "/coupons/update-count/:code",

      async (req, res) => {
        try {
          const code = req.params.code.toUpperCase();
          const filter = { code: code };

          const updateDoc = {
            $inc: { usedCount: 1 },
          };

          const result = await couponCollection.updateOne(filter, updateDoc);

          if (result.modifiedCount > 0) {
            res.send({ success: true, message: "Coupon usage updated!" });
          } else {
            res
              .status(404)
              .send({ success: false, message: "Coupon code not found!" });
          }
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .send({ message: "Server error while updating coupon count" });
        }
      },
    );

    // Order Save API

    app.post("/orders", async (req, res) => {
      const order = req.body;

      try {
        if (!order || !order.items || !order.totalAmount) {
          return res.status(400).send({ message: "Invalid order data" });
        }

        const result = await orderCollection.insertOne(order);

        if (
          result.insertedId &&
          Array.isArray(order.cartIds) &&
          order.cartIds.length > 0
        ) {
          const validCartIds = order.cartIds
            .filter((id) => id && ObjectId.isValid(id))
            .map((id) => new ObjectId(id));

          if (validCartIds.length > 0) {
            await cartCollection.deleteMany({ _id: { $in: validCartIds } });
          }
        }

        if (order.couponCode) {
          const coupon = await couponCollection.findOne({
            code: order.couponCode.toUpperCase(),
            isActive: true,
          });

          if (coupon) {
            const now = new Date();
            const expiry = new Date(coupon.expiryDate);

            if (now <= expiry && coupon.usedCount < coupon.usageLimit) {
              await couponCollection.updateOne(
                { code: coupon.code },
                {
                  $inc: { usedCount: 1 },
                  $addToSet: { usedBy: order.email || "unknown" },
                },
              );
            }
          }
        }

        res.status(201).send(result);
      } catch (error) {
        console.error("CRITICAL ORDER ERROR:", error);
        res.status(500).send({
          message: "Order saving failed on server",
          error: error.message,
        });
      }
    });

    app.get("/orders", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const result = await orderCollection
        .find()
        .sort({ orderDate: -1 })
        .toArray();
      res.send(result);
    });

    app.patch(
      "/orders/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { deliveryStatus } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid Order ID" });
          }

          const filter = { _id: new ObjectId(id) };
          const updateDoc = {
            $set: {
              deliveryStatus: deliveryStatus,

              ...(deliveryStatus === "success" && { deliveredAt: new Date() }),
            },
          };

          const result = await orderCollection.updateOne(filter, updateDoc);

          if (result.modifiedCount > 0) {
            res.send({
              success: true,
              message: `Status updated to ${deliveryStatus}`,
            });
          } else {
            res.status(404).send({
              success: false,
              message: "Order not found or no change made",
            });
          }
        } catch (error) {
          console.error("Error updating order:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      },
    );

    // Get All Users
    app.get("/users", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // --- 1. User Registration / Save (Default Role: User) ---
    app.post("/users", async (req, res) => {
      const user = req.body;

      // Check if user already exists
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }

      // Double check role on backend for security
      const newUser = {
        ...user,
        role: "user", // Default Role
        createdAt: new Date(),
      };

      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // --- 2. Make Admin
    app.patch(
      "/users/admin/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      },
    );

    // --- 3. Remove Admin (Demote back to User) ---
    app.patch(
      "/users/user/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "user",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      },
    );

    // Search email and make admin

    app.get("/users/search", async (req, res) => {
      const email = req.query.email;

      const query = { email: { $regex: email, $options: "i" } };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.get("/users/admin/:email", async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "user not found" });
        }
        res.send({ role: user.role || "user" });
      } catch (error) {
        console.log("error user role:", error);
        res.status(500).send({ message: "Filed to get role " });
      }
    });

    // pyment intern stripe

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { items, couponCode, district } = req.body;

        let subtotal = 0;

        // 🔥 REAL PRICE FROM DB
        for (const item of items) {
          const cleanId = item.productId.split("-")[0];
          if (!ObjectId.isValid(cleanId)) continue;

          const product = await productsCollection.findOne({
            _id: new ObjectId(cleanId),
          });

          if (product) {
            subtotal += product.price * (item.quantity || 1);
          }
        }

        let finalAmount = subtotal;

        let coupon = null;

        if (couponCode) {
          coupon = await couponCollection.findOne({
            code: couponCode.trim().toUpperCase(),
            isActive: true,
          });
        }

        let discount = 0;

        if (coupon && subtotal >= (coupon.minPurchase || 0)) {
          if (coupon.discountType === "fixed") {
            discount = coupon.discountValue;
          } else if (coupon.discountType === "percent") {
            discount = (subtotal * coupon.discountValue) / 100;
          }

          // 🛡️ never allow over-discount
          discount = Math.min(discount, subtotal);
        }

        finalAmount -= discount;

        const shipping = district === "Dhaka" ? 80 : 120;
        finalAmount += shipping;

        const amountInCents = Math.round(finalAmount * 100);

        if (amountInCents < 50) {
          return res
            .status(400)
            .send({ message: "Amount is too low for card payment" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });

    app.get(
      "/admin-stats",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const totalUsers = await userCollection.estimatedDocumentCount();
          const totalProducts =
            await productsCollection.estimatedDocumentCount();
          const totalOrders = await orderCollection.estimatedDocumentCount();
          const totalCoupons = await couponCollection.estimatedDocumentCount();
          const totalCartItems = await cartCollection.estimatedDocumentCount();

          const products = await productsCollection
            .find({}, { projection: { category: 1 } })
            .toArray();
          const categoryCounts = products.reduce((acc, curr) => {
            const cat = curr.category || "Others";
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
          }, {});

          const categoryData = Object.keys(categoryCounts).map((key) => ({
            name: key,
            value: categoryCounts[key],
          }));

          const allOrders = await orderCollection.find().toArray();

          let totalRevenue = 0;
          let successOrders = 0;
          let pendingOrders = 0;
          let paidOrders = 0;
          let unpaidOrders = 0;

          allOrders.forEach((order) => {
            if (order.paymentStatus === "paid") {
              totalRevenue += parseFloat(order.totalAmount || 0);
              paidOrders++;
            } else {
              unpaidOrders++;
            }

            if (
              order.deliveryStatus === "delivered" ||
              order.deliveryStatus === "confirmed"
            ) {
              successOrders++;
            } else if (order.deliveryStatus === "pending") {
              pendingOrders++;
            }
          });

          res.send({
            summary: {
              totalUsers,
              totalProducts,
              totalOrders,
              totalRevenue: parseFloat(totalRevenue.toFixed(2)),
              totalCoupons,
              totalCartItems,
              successOrders,
              pendingOrders,
              paidOrders,
              unpaidOrders,
            },
            categoryData,

            chartData: [
              { name: "Total Orders", count: totalOrders },
              { name: "Success", count: successOrders },
              { name: "Pending", count: pendingOrders },
              { name: "In Cart", count: totalCartItems },
            ],
          });
        } catch (error) {
          console.error("Admin Stats Error:", error);
          res
            .status(500)
            .send({ message: "Internal Server Error", error: error.message });
        }
      },
    );

    // Send a ping to confirm a successful connection

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!",
    // );
  } finally {
  }
}
run().catch(console.dir);

// start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
