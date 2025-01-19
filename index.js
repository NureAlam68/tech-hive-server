const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
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
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const productCollection = client.db("TechHiveDB").collection("products");
    const userCollection = client.db("TechHiveDB").collection("users");


    // jwt related api
    app.post('/jwt', async(req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: '30d'
        });
        res.send({token})
      })

      // middlewares
    const verifyToken = (req, res, next) => {
        if(!req.headers.authorization) {
          return res.status(401).send({message: 'unauthorized access'})
        }
        const token = req.headers.authorization.split(' ')[1];
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
          if(err){
            return res.status(401).send({message: 'unauthorized access'})
          }
          req.decoded = decoded;
          next(); 
        })
      }

      // user related api
    app.get('/users', verifyToken, async(req, res) => {
      // console.log(req.headers)
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    // product related apis
    app.get('/products', async(req,res) => {
      const email = req.query.email;
      const query = { email: email};
      const result = await productCollection.find(query).toArray();
      res.send(result)
    })

    app.post('/products', async(req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('TechHive server is running')
})

app.listen(port, () => {
  console.log(`TechHive server is running on port ${port}`)
})