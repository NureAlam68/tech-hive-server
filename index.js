const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8kdu5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

    const productCollection = client.db("TechHiveDB").collection("products");
    const userCollection = client.db("TechHiveDB").collection("users");
    const reviewsCollection = client.db("TechHiveDB").collection("reviews");
    const reportCollection = client.db("TechHiveDB").collection("reports");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "30d",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers)
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send(user);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.get("/users/moderator/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let moderator = false;
      if (user) {
        moderator = user?.role === "moderator";
      }
      res.send({ moderator });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
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
      }
    );

    app.patch(
      "/users/moderator/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "moderator",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    // product related apis
    app.get("/products", async (req, res) => {
      const email = req.query.email;

      let query = {};

      if (email) {
        query = { email: email };
      }

      try {
        const result = await productCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/accepted-products", async (req, res) => {
      try {
        const { page = 1, search = "" } = req.query;
        const limit = 6;
        const skip = (parseInt(page) - 1) * limit;
    
        let query = { status: "Accepted" };
        if (search) {
          query.tags = { $regex: search, $options: "i" }; 
        }
    
        const products = await productCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();
    
        const totalProducts = await productCollection.countDocuments(query);
    
        res.send({
          products,
          totalPages: Math.ceil(totalProducts / limit),
          currentPage: parseInt(page),
        });
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    // Get Product Details
    app.get("/product/:id", async (req, res) => {
      const productId = req.params.id;
      try {
        const product = await productCollection.findOne({
          _id: new ObjectId(productId),
        });
        if (!product) {
          return res.status(404).send({ message: "Product not found" });
        }
        res.send(product);
      } catch (error) {
        console.error("Error fetching product details:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Get Reviews for a Product
    app.get("/reviews/:productId", async (req, res) => {
      const productId = req.params.productId;
      try {
        const reviews = await reviewsCollection
          .find({ productId: new ObjectId(productId) })
          .toArray();
        // console.log("Fetched Reviews:", reviews);
        res.send(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Post a review
    app.post("/reviews", verifyToken, async (req, res) => {
      const {
        productId,
        reviewDescription,
        rating,
        reviewerName,
        reviewerImage,
      } = req.body;

      const newReview = {
        productId: new ObjectId(productId),
        reviewerName,
        reviewerImage,
        reviewDescription,
        rating,
        createdAt: new Date(),
      };

      try {
        const result = await reviewsCollection.insertOne(newReview);
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ message: "Failed to post review" });
      }
    });

    app.get("/reported-products", verifyToken, async (req, res) => {
      try {
          const reports = await reportCollection.find().toArray();
          res.send(reports);
      } catch (error) {
          res.status(500).send({ message: "Internal Server Error" });
      }
  });
  

  // Report Product 
  app.post("/report/:id", verifyToken, async (req, res) => {
  const productId = req.params.id;
  const { email } = req.body;

  try {
    const product = await productCollection.findOne({ _id: new ObjectId(productId) });

    if (!product) {
      return res.status(404).send({ message: "Product not found" });
    }

    const existingReport = await reportCollection.findOne({ productId: new ObjectId(productId), reportedBy: email });

   if (existingReport) {
    return res.status(400).send({ message: "You have already reported this product" });
   }

    const report = {
      productId: new ObjectId(productId),
      productName: product.productName, 
      reportedBy: email,
      createdAt: new Date(),
    };

    const result = await reportCollection.insertOne(report);
    res.send(result);
  } catch (error) {
    // console.error("Error reporting product:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

app.delete("/reported-products/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  try {
      await productCollection.deleteOne({ _id: new ObjectId(id) });

      await reportCollection.deleteOne({ productId: new ObjectId(id) });

      res.send({ message: "Product deleted successfully" });
  } catch (error) {
      res.status(500).send({ message: "Failed to delete product" });
  }
});


    app.post("/products", async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    app.patch("/products/:id", async (req, res) => {
      const data = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          productName: data.productName,
          productImage: data.productImage,
          description: data.description,
          externalLink: data.externalLink,
          tags: data.tags,
        },
      };
      const result = await productCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.patch("/products/status/:id", async (req, res) => {
      const { status, featured } = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateFields = {};

      if (status) updateFields.status = status;
      if (featured !== undefined) updateFields.featured = featured;

      const updatedDoc = { $set: updateFields };
      const result = await productCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/featured-products", async (req, res) => {
      try {
        const products = await productCollection
          .find({ featured: true }) // Only featured products
          .sort({ createdAt: -1 }) // Sort by latest
          .limit(4)
          .toArray();
        res.send(products);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Upvote Route
    app.patch("/upvote/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { email } = req.body;

      // console.log("Upvote API Called for ID:", id, "By User:", email);

      try {
        const product = await productCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          // console.log("Product Not Found!");
          return res.status(404).send({ message: "Product not found" });
        }

        if (product.email === email) {
          // console.log("User is trying to upvote own product!");
          return res
            .status(403)
            .send({ message: "You cannot upvote your own product" });
        }

        // Ensure `votedUsers` exists
        const alreadyVoted = (product.votedUsers || []).includes(email);
        if (alreadyVoted) {
          // console.log("User has already voted!");
          return res.status(400).send({ message: "You have already voted" });
        }

        const updateFields = {
          $inc: { upvote: 1 },
          $push: { votedUsers: email }, // Store voter
        };

        const result = await productCollection.updateOne(
          { _id: new ObjectId(id) },
          updateFields
        );

        // console.log("Upvote Success!", result);
        res.send(result);
      } catch (error) {
        // console.error("Upvote Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/trending-products", async (req, res) => {
      try {
        const trendingProducts = await productCollection
          .find({})
          .sort({ upvote: -1 }) // Sort by highest upvote count
          .limit(6) // Maximum 6 products
          .toArray();

        res.send(trendingProducts);
      } catch (error) {
        console.error("Error fetching trending products:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // payment intent
    app.post('/create-payment-intent', async(req, res) => {
      const { amount } = req.body;
      const amountInt = parseInt(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInt,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // Update user's subscription status after payment
app.post('/users/subscribe', async (req, res) => {
  const { email, transactionId } = req.body;

  const filter = { email };
  const updateDoc = {
    $set: { isSubscribed: true, transactionId },
  };

  const result = await userCollection.updateOne(filter, updateDoc);
  res.send(result);
});

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("TechHive server is running");
});

app.listen(port, () => {
  console.log(`TechHive server is running on port ${port}`);
});
