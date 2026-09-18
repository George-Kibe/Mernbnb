const express = require("express");
const cors = require("cors");
const { default: mongoose } = require("mongoose");
const jwt = require("jsonwebtoken")
const cookieparser = require("cookie-parser")
const dotenv = require("dotenv")
const imageDownloader = require("image-downloader")
const {S3Client, PutObjectCommand} = require("@aws-sdk/client-s3")
const multer = require('multer')
const mime = require("mime-types")
dotenv.config({ quiet: true })
const Booking = require("./models/Booking")
const User = require("./models/User")
const Place = require("./models/Place")
const bcrypt = require("bcryptjs")
const fs = require("fs")

const app = express();
const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = 'ugbnuwnfuwi7371gyrjfkwg20';

const PORT = 5000
const bucket ="mernbnb-images-bucket"

app.use(cors());
app.use(express.json())
app.use(cookieparser());
app.use("/uploads", express.static(__dirname + "/uploads"));

app.get("/", (req,res) => {
    res.json(`Server running on port ${PORT}. Working Fine!`)
})

//mongoose.connect(process.env.MONGO_URL)

//function to upload images to s3 bucket
const uploadToS3 = async(path, originalFileName, mimetype) => {
    const client = new S3Client({
        region: "eu-west-1",
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
        }
    })
    const parts = originalFileName.split(".");
    const ext = parts[parts.length - 1];
    const newFileName = Date.now() + "." + ext;
    try {
        const response = await client.send(new PutObjectCommand({
            Bucket: bucket,
            Body: fs.readFileSync(path),
            Key: newFileName,
            ContentType: mimetype,
            //ACL:"public-read"
        }));
        //console.log(response)
        return `https://${bucket}.s3.amazonaws.com/${newFileName}`
    } catch (error) {
        console.log(error)
        return error
    }

    //console.log(path, originalFileName, mimetype, ext);
}




app.post("/api/users/register", async(req, res) => {
    mongoose.connect(process.env.MONGO_URL)
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
    mongoose.connect(process.env.MONGO_URL)
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
    mongoose.connect(process.env.MONGO_URL)
    const token = req.cookies;

    res.json(token)
})


app.use("/api/upload-by-link", async(req, res) => {
    //mongoose.connect(process.env.MONGO_URL)
    const {link} = req.body;
    const newName = "photo" + Date.now() + ".jpg";
    try {
        const response = await imageDownloader.image({
            url: link,
            dest: "/tmp/" + newName
        })
        //reponds with filename
        const url = await uploadToS3("/tmp/"+newName, newName, mime.lookup("/tmp/" + newName))
        res.status(201).json(url)
    } catch (error) {
        res.status(422).json(error);
        return
    }
})

//uploading photos to s3
const photosMiddleware = multer({dest:"/tmp"})
app.post("/api/upload", photosMiddleware.array("photos", 100), async(req,res) => {
    mongoose.connect(process.env.MONGO_URL)
    //console.log(req.files)
    try {
        const uploadedFiles = [];
        for (let i = 0; i < req.files.length; i++) {
            //console.log(req.files[i])
            const {path, originalname, mimetype} = req.files[i]
            const url = await uploadToS3(path, originalname, mimetype);
            uploadedFiles.push(url)
        }
        res.status(201).json(uploadedFiles)
    } catch (error) {
        res.status(422).json("Unprocessable Entry!");
        return
    }
})

//uploading photos to local folder
// const photosMiddleware = multer({dest:"uploads"})
// app.post("/upload", photosMiddleware.array("photos", 100), async(req,res) => {
//     try {
//         const uploadedFiles = [];
//         for (let i = 0; i < req.files.length; i++) {
//             console.log(req.files[i])
//             const {path, originalname} = req.files[i];
//             console.log(path, originalname);
//             const parts = originalname.split(".");
//             const ext = parts[parts.length-1];
//             const newPath = path +"." + ext;
//             //rename
//             fs.renameSync(path, newPath);
//             uploadedFiles.push(newPath.replace("uploads/", ""));
//         }
//         res.status(201).json(uploadedFiles)
//     } catch (error) {
//         res.status(422).json("Unprocessable Entry!");
//         return
//     }
// })

//create a new place
app.post("/api/places", async(req,res) => {
    //console.log(req.body);
    mongoose.connect(process.env.MONGO_URL)
    try {
        const placeDoc = await Place.create(req.body);
        if(!placeDoc){
            res.status(422).json("Unprocessable Entry");
            return;
        }
        res.status(201).json(placeDoc);
    } catch (error) {
        console.log(error);
        res.status(422).json("Unprocessable Entry");
        return;
    }
})
//get all places
app.get("/api/places", async(req,res)=> {
    mongoose.connect(process.env.MONGO_URL)
    try {
        const placeDocs = await Place.find();
        if (!placeDocs){
            res.status(404).json("No Places Yet!");
            return;
        }
        res.status(200).json(placeDocs);
    } catch (error) {
        res.status(422).json("Unprocessable entry!");
        return
    }
})


//get my places
app.get("/api/places/:owner", async(req,res)=> {
    mongoose.connect(process.env.MONGO_URL)
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
        res.status(200).json(placeDocs);
    } catch (error) {
        res.status(422).json("Unprocessable entry!");
        return
    }
})

//get one place by id
app.get("/api/places/place/:id", async(req, res)=> {
    mongoose.connect(process.env.MONGO_URL)
    const {id} = req.params;
    if(!id){
        res.status(422).json("Not Processable!");
        return
    }
    try {
        placeDoc = await Place.findById(id);
        res.status(200).json(placeDoc)
    } catch (error) {
       res.status(404).json("Not Found!") 
       return
    }
})


//update a place
app.put("/api/places/:placeId/:ownerId", async(req,res) => {
    mongoose.connect(process.env.MONGO_URL)
    const {ownerId, placeId} = req.params;
    const placeData = req.body;
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

app.post("/api/bookings", async(req,res) => {
    mongoose.connect(process.env.MONGO_URL)
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
    mongoose.connect(process.env.MONGO_URL)
    const {ownerId} = req.params;
    if (!ownerId){
        res.status(422).json("Unprocessable!");
        return;
    }
    try {
        bookingDocs = await Booking.find({owner:ownerId}).populate("place");
        res.status(200).json(bookingDocs);
        return;
    } catch (error) {
        res.status(422).json("Unprocessable!");
        return;
    }
})

//get single booking for a single user
app.get("/api/booking/:id", async(req,res) => {
    mongoose.connect(process.env.MONGO_URL)
    const {id} = req.params;
    if (!id){
        res.status(422).json("Unprocessable!");
        return;
    }
    try {
        bookingDocs = await Booking.findById(id).populate("place");
        res.status(200).json(bookingDocs);
        return;
    } catch (error) {
        res.status(404).json("Unprocessable!");
        return;
    }
})

app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}!`)
})




