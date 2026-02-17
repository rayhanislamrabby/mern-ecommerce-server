const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gdoalz6.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

    // Product Fetch Route
    app.get("/products", async (req, res) => {
      try {
        // .sort({ _id: -1 }) ensures the last product is at the top
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

      // Validation (Optional but recommended)
      if (!product.name || !product.price) {
        return res
          .status(400)
          .send({ message: "Product name and price are required" });
      }

      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    // update ar jonn

    // ✅ ঠিক করা ব্যাকএন্ড কোড
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

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// test route
app.get("/", (req, res) => {
  res.send("Server is running...");
});

// start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
