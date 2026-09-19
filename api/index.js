const express = require("express");
const cors = require("cors");
const { default: mongoose } = require("mongoose");
const jwt = require("jsonwebtoken")
const cookieparser = require("cookie-parser")
const dotenv = require("dotenv")
dotenv.config({ quiet: true })
const Booking = require("./models/Booking")
const User = require("./models/User")
const Place = require("./models/Place")
const bcrypt = require("bcryptjs")
const { jwtSecret, requireAuth } = require("./lib/auth")
const {
    MAX_IMAGE_BYTES, UploadError, newPhotoKey, createUploadUrls, putPhoto,
    normalizePhotos, photoUrl, withPhotoUrls,
} = require("./lib/s3")
const { fetchImage, FetchImageError } = require("./lib/fetchImage")

const app = express();
const bcryptSalt = bcrypt.genSaltSync(10);

const PORT = 5000

app.use(cors());
app.use(express.json())
app.use(cookieparser());
app.use("/uploads", express.static(__dirname + "/uploads"));

app.get("/", (req,res) => {
    res.json(`Server running on port ${PORT}. Working Fine!`)
})


// Connect once and reuse the promise across requests (and warm serverless
// invocations). Fail fast so a dead database surfaces as a 503 with CORS
// headers instead of a function timeout the browser reports as a CORS error.
let dbConnection = null;
const connectDB = () => {
    dbConnection ??= mongoose
        .connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 5000 })
        .catch((error) => {
            dbConnection = null; // allow a retry on the next request
            throw error;
        });
    return dbConnection;
}

const requireDB = async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        res.status(503).json("Database unavailable. Try again later.");
    }
}
app.use(["/api/users", "/api/places", "/api/bookings", "/api/booking"], requireDB);

app.post("/api/users/register", async(req, res) => {
    const {name, email, password} = req.body;
    if(!name || !email ||!password){
        res.status(400).json("Invalid Request")
        return
    }
    try {
        const userDoc = await User.create({
            name, 
            email,
            password: bcrypt.hashSync(password, bcryptSalt)
        })
        res.status(201).json(userDoc)
    } catch (error) {
        res.status(422).json(error)
        return
    }
})

app.post('/api/users/login', async(req,res) => {
    const {email, password} = req.body;
    const userDoc  = await User.findOne({email});
    if (userDoc){
        const passwordOk = bcrypt.compareSync(password, userDoc.password);
        if (passwordOk){
            const time = new Date();
            const token = jwt.sign({name:userDoc.name, email:userDoc.email, id:userDoc._id, time}, jwtSecret, {});            
            console.log(time);
            if (token){
                res.cookie('token', token).status(202).json({userDoc,token});
                return
            } else {
                res.status(422).json("Token Genrating Error! Try Again!");
                return
            }
            
        } else {
            res.status(422).json("Invalid email or Password");
            return
        }
    }else{
        res.status(404).json("Not Found!")
    }
})

app.get("/api/users/profile", async(req, res) => {
    const token = req.cookies;

    res.json(token)
})


// Photos are uploaded straight from the browser to S3 with presigned URLs.
// Body: { files: [{ type, size }] } -> [{ key, uploadUrl, url }]
app.post("/api/uploads/presign", requireAuth, async(req, res) => {
    try {
        const uploads = await createUploadUrls(req.user.id, req.body?.files);
        res.status(201).json(uploads);
    } catch (error) {
        if (error instanceof UploadError) {
            res.status(400).json(error.message);
            return;
        }
        console.error("Presigning uploads failed:", error);
        res.status(500).json("Could not prepare the upload. Try again.");
    }
})

// The server downloads an image from a link and stores it in S3.
// Body: { link } -> { key, url }
app.post("/api/uploads/by-link", requireAuth, async(req, res) => {
    try {
        const { buffer, type } = await fetchImage(req.body?.link, { maxBytes: MAX_IMAGE_BYTES });
        const key = newPhotoKey(req.user.id, type);
        await putPhoto(key, buffer, type);
        res.status(201).json({ key, url: await photoUrl(key) });
    } catch (error) {
        if (error instanceof FetchImageError) {
            res.status(422).json(error.message);
            return;
        }
        console.error("Uploading by link failed:", error);
        res.status(500).json("Could not save that image. Try again.");
    }
})

//create a new place
app.post("/api/places", async(req,res) => {
    //console.log(req.body);
    try {
        const placeDoc = await Place.create({ ...req.body, photos: normalizePhotos(req.body?.photos) });
        if(!placeDoc){
            res.status(422).json("Unprocessable Entry");
            return;
        }
        res.status(201).json(await withPhotoUrls(placeDoc));
    } catch (error) {
        console.log(error);
        res.status(422).json("Unprocessable Entry");
        return;
    }
})
const toInt = (value, fallback) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "2026-10-01" -> Date at UTC midnight (how booking dates are stored), else null.
const parseDay = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
};

// Mongo filter for the home-page search. Unknown or invalid values are ignored.
//   location: matches the address (case-insensitive substring)
//   guests:   place must sleep at least this many
//   pets:     place must allow pets
//   checkin/checkout: excludes places with an overlapping booking
const placeSearchFilter = async ({ location, guests, pets, checkin, checkout }) => {
    const filter = {};
    if (typeof location === "string" && location.trim()) {
        filter.address = { $regex: escapeRegex(location.trim().slice(0, 100)), $options: "i" };
    }
    const guestCount = toInt(guests, 0);
    if (guestCount > 0) filter.maxGuests = { $gte: guestCount };
    if (toInt(pets, 0) > 0) filter.perks = "Pets Allowed";
    const from = parseDay(checkin);
    const to = parseDay(checkout);
    if (from && to && to > from) {
        const booked = await Booking.distinct("place", { checkIn: { $lt: to }, checkOut: { $gt: from } });
        if (booked.length) filter._id = { $nin: booked };
    }
    return filter;
};

//get places, newest first, one page at a time
// Query: ?page=1&limit=12 plus optional search filters (see placeSearchFilter)
// -> { places, page, limit, total, totalPages }
const PLACES_PAGE_SIZE = 12;
const MAX_PLACES_PAGE_SIZE = 50;
app.get("/api/places", async(req,res)=> {
    const limit = Math.min(Math.max(toInt(req.query.limit, PLACES_PAGE_SIZE), 1), MAX_PLACES_PAGE_SIZE);
    const page = Math.max(toInt(req.query.page, 1), 1);
    try {
        const filter = await placeSearchFilter(req.query);
        const [total, placeDocs] = await Promise.all([
            Place.countDocuments(filter),
            Place.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
        ]);
        res.status(200).json({
            places: await Promise.all(placeDocs.map(withPhotoUrls)),
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error("Listing places failed:", error);
        res.status(500).json("Could not load places. Try again.");
    }
})


// Destination suggestions for the search bar: each comma-separated part of
// the listing addresses ("Diani Beach", "Kwale"), with how many stays match.
// Registered before /api/places/:owner so "destinations" isn't taken as an owner id.
app.get("/api/places/destinations", async(req, res) => {
    try {
        const addresses = await Place.aggregate([{ $group: { _id: "$address", count: { $sum: 1 } } }]);
        const counts = new Map();
        for (const { _id: address, count } of addresses) {
            if (typeof address !== "string") continue;
            const parts = new Set(address.split(",").map((part) => part.trim()).filter(Boolean));
            for (const part of parts) counts.set(part, (counts.get(part) || 0) + count);
        }
        const destinations = [...counts]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        res.status(200).json(destinations);
    } catch (error) {
        console.error("Listing destinations failed:", error);
        res.status(500).json("Could not load destinations.");
    }
})

//get my places
app.get("/api/places/:owner", async(req,res)=> {
    const owner = req.params.owner;
    if(!owner){
        res.status(422).json("Unprocessable entry!");
        return
    }
    try {
        const placeDocs = await Place.find({owner});
        if (!placeDocs){
            res.status(404).json("You do not have any Places Yet!");
            return;
        }
        res.status(200).json(await Promise.all(placeDocs.map(withPhotoUrls)));
    } catch (error) {
        res.status(422).json("Unprocessable entry!");
        return
    }
})

//get one place by id
app.get("/api/places/place/:id", async(req, res)=> {
    const {id} = req.params;
    if(!id){
        res.status(422).json("Not Processable!");
        return
    }
    try {
        const placeDoc = await Place.findById(id);
        if (!placeDoc) {
            res.status(404).json("Not Found!");
            return;
        }
        res.status(200).json(await withPhotoUrls(placeDoc))
    } catch (error) {
       res.status(404).json("Not Found!") 
       return
    }
})


//update a place
app.put("/api/places/:placeId/:ownerId", async(req,res) => {
    const {ownerId, placeId} = req.params;
    const placeData = { ...req.body };
    if ("photos" in placeData) {
        placeData.photos = normalizePhotos(placeData.photos);
    }
    const placeDoc = await Place.findById(placeId)
    if (!placeDoc) {
        res.status(404).json("Unprocessable!");
        return;
    }
    console.log(ownerId, placeDoc.owner.toString())
    if(ownerId === placeDoc.owner.toString()) {
        try {
            placeDoc.set(placeData);
            await placeDoc.save()
            res.status(201).json("Updated Successfully!")
        } catch (error) {
            res.status(409).json("Insersion conflict");
            return;
        }
    } else{
        res.status(401).json("Unauthorized!")
    }

})

const bookingWithPhotoUrls = async (bookingDoc) => {
    const booking = bookingDoc.toObject();
    booking.place = await withPhotoUrls(booking.place);
    return booking;
}

app.post("/api/bookings", async(req,res) => {
    const {bookingData} = req.body;
    if(!bookingData) {
        res.status(422).json("Unprocessable");
        return;
    }    
    try {
        const bookingDoc = await Booking.create(bookingData);
        if(!bookingDoc) {
            res.status(422).json("Unprocessable");
            return;
        }
        res.status(201).json(bookingDoc)
    } catch (error) {
        res.status(422).json("Unprocessable");
        return; 
    }
})

//get bookings for a single user
app.get("/api/bookings/:ownerId", async(req,res) => {
    const {ownerId} = req.params;
    if (!ownerId){
        res.status(422).json("Unprocessable!");
        return;
    }
    try {
        const bookingDocs = await Booking.find({owner:ownerId}).populate("place");
        res.status(200).json(await Promise.all(bookingDocs.map(bookingWithPhotoUrls)));
        return;
    } catch (error) {
        res.status(422).json("Unprocessable!");
        return;
    }
})

//get single booking for a single user
app.get("/api/booking/:id", async(req,res) => {
    const {id} = req.params;
    if (!id){
        res.status(422).json("Unprocessable!");
        return;
    }
    try {
        const bookingDoc = await Booking.findById(id).populate("place");
        if (!bookingDoc) {
            res.status(404).json("Not Found!");
            return;
        }
        res.status(200).json(await bookingWithPhotoUrls(bookingDoc));
        return;
    } catch (error) {
        res.status(404).json("Unprocessable!");
        return;
    }
})

app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}!`)
})




