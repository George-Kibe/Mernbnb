const mongoose = require("mongoose");
const {Schema} = mongoose;

const BookingSchema = new Schema({
    place: {type:mongoose.Schema.Types.ObjectId, ref:"Place", require:true},
    owner: {type:mongoose.Schema.Types.ObjectId, ref:"User", require:true},
    checkIn: {type:Date, require:true},
    checkOut: {type:Date, require:true},
    name: {type:String, require:true},
    phoneNumber: {type:String, require:true},
    email: {type:String, require:true},
    price: Number,
},
    {timestamps: true}
)

const BookingModel = mongoose.model("Booking", BookingSchema);

module.exports = BookingModel;