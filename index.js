const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require("mongodb");
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

    const db = client.db("ecommerce");

    const productsCollection = db.collection("products");

    app.get("/api/products", async (req, res) => {
      try {
        const { search, category, page = 1, limit = 10, sort } = req.query;

        const query = {};

        // 🔎 search by name
        if (search) {
          query.name = { $regex: search, $options: "i" };
        }

        // 🏷 category filter
        if (category) {
          query.category = category;
        }

        // sorting
        let sortOption = {};
        if (sort === "low") sortOption.price = 1;
        if (sort === "high") sortOption.price = -1;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const products = await productsCollection
          .find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        const total = await productsCollection.countDocuments(query);

        res.send({
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit),
          products,
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch products" });
      }
    });

    app.post("/api/products", async (req, res) => {
      try {
        const { name, price, category, image, stock, description } = req.body;

        // ✅ basic validation
        if (!name || !price || !category) {
          return res.status(400).send({
            success: false,
            message: "Name, price and category are required",
          });
        }

        const newProduct = {
          name,
          price: Number(price),
          category,
          image: image || "",
          stock: stock || 0,
          description: description || "",
          createdAt: new Date(),
        };

        const result = await productsCollection.insertOne(newProduct);

        res.status(201).send({
          success: true,
          message: "Product created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Server error while creating product",
        });
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
