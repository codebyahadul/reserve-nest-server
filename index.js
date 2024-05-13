const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const cors = require('cors');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000;

// middleware
app.use(cors(
  {
    origin: ['http://localhost:5173', 'https://reserve-nest.firebaseapp.com', 'https://reserve-nest.web.app'],
    credentials: true
  }
))
app.use(express.json())
app.use(cookieParser())

// custom middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized' })
  }
  jwt.verify(token, process.env.TOKEN_SECRETE, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Unauthorized access" })
    }
    req.user = decoded;
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ifklbg0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    // await client.connect();

    const roomsCollection = client.db('serveNest').collection('rooms')
    const bookingsCollection = client.db('serveNest').collection('bookings')
    const reviewCollection = client.db('serveNest').collection('reviews')
    // auth related api

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRETE, { expiresIn: '365d' })
      res
        .cookie('token', token, cookieOptions)
        .send({ success: true })
    })
    app.post('/logout', async (req, res) => {
      res
        .clearCookie('token', { maxAge: 0 })
        .send({ success: true })
    })
    // get all the rooms
    app.get('/rooms', async (req, res) => {
      const result = await roomsCollection.find().toArray()
      res.send(result)
    })

    // filter rooms data 
    app.post('/rooms/filter', async (req, res) => {
      const { minPrice, maxPrice } = req.body;
      // Construct the MongoDB query based on the provided price range
      const query = {};
      if (minPrice !== undefined && maxPrice !== undefined) {
        query.price_per_night = { $gte: parseInt(minPrice), $lte: parseInt(maxPrice) };
      } else if (minPrice !== undefined) {
        query.price_per_night = { $gte: parseInt(minPrice) };
      } else if (maxPrice !== undefined) {
        query.price_per_night = { $lte: parseInt(maxPrice) };
      }
      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })
    // get single rooms for see room details
    app.get('/rooms/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await roomsCollection.findOne(query);
      res.send(result)
    })

    // store bookings room data on bookingsCollection 
    app.post('/booking-room', async (req, res) => {
      const bookingData = req.body;
      const result = await bookingsCollection.insertOne(bookingData);
      res.send(result)
    })

    // update availability
    app.patch('/update-status/:title', async (req, res) => {
      const title = req.params.title;
      const updateData = req.body;
      const filter = { room_title: title }
      const updateDoc = {
        $set: {
          availability: updateData.availability
        }
      }
      const result = await roomsCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // get the specific user bookings data
    app.get('/my-booking/:email', verifyToken, async (req, res) => {
      if (req.params.email !== req.user?.email) {
        return res.status(403).send('Forbidden')
      }
      const email = req.params.email;
      const query = { booking_email: email }
      const result = await bookingsCollection.find(query).toArray();
      res.send(result)
    })

    // delete a booking data 
    app.delete('/my-booking/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await bookingsCollection.deleteOne(filter)
      res.send(result)
    })

    // get single data for update booking date 
    app.get('/update-date/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = {
        projection: { _id: 0, }
      }
      const result = await bookingsCollection.findOne(query, options)
      res.send(result)
    })
    // get single data for review booking room 
    app.get('/review/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.findOne(query)
      res.send(result)
    })

    //update booking date 
    app.put('/update-date/:id', async (req, res) => {
      const id = req.params.id;
      const updateDate = req.body;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          booking_date: updateDate.update_date
        }
      }
      const result = await bookingsCollection.updateOne(filter, updateDoc)
      res.send(result)
    })

    // reviews related api 

    // post review 
    app.post('/reviews', async (req, res) => {
      const reviewData = req.body;
      const result = await reviewCollection.insertOne(reviewData)
      // increase total review count
      const updateTotalReview = await roomsCollection.updateOne({
        room_title: reviewData.room_title
      },
        {
          $inc: {
            total_review: 1
          }
        }
      )
      res.send(result)
    })

    //get review data 
    app.get('/reviews', async (req, res) => {
      const query = {currentTime: -1}
      const result = await reviewCollection.find().sort(query).toArray()
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from Serve Nest server...')
})

app.listen(port, () => {
  console.log(`Serve Nest server is running on port: ${port}`);
})