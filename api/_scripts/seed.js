// Seeds demo listings (with hotlinked Unsplash photos) owned by a demo host.
//
//   npm run seed            # (re)create the demo listings
//   npm run seed -- --clear # remove them, and any bookings made on them
//
// Uses MONGO_URL from api/.env. Only documents owned by the demo host are
// touched, so real listings are never modified.
require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Place = require("../models/Place");
const Booking = require("../models/Booking");

const DEMO_HOST = { name: "AirBuenas Demo Host", email: "demo-host@airbuenas.test" };

// Unsplash photos (free to hotlink). Each listing gets an exterior cover
// followed by matching interiors.
const photo = (id) => `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;
const P = {
    // exteriors
    poolVilla: photo("1564013799919-ab600027ffc6"),
    whitePoolVilla: photo("1600596542815-ffad4c1539a9"),
    treeModern: photo("1600585154340-be6161a56a0c"),
    whiteModern: photo("1512917774080-9991f1c4c750"),
    farmhouse: photo("1570129477492-45c003edd2be"),
    timberModern: photo("1600566753190-17f0baa2a6c3"),
    lapPoolModern: photo("1613490493576-7fde63acd811"),
    modernPoolVilla: photo("1580587771525-78b9dba3b914"),
    aFrameCabin: photo("1568605114967-8130f3a36994"),
    whiteMinimal: photo("1523217582562-09d0def993a6"),
    forestCottage: photo("1449844908441-8829872d2607"),
    sunsetCabin: photo("1542718610-a1d656d1884c"),
    beachBungalow: photo("1499793983690-e29da59ef1c2"),
    tropicalResort: photo("1520250497591-112f2f40a3f4"),
    thatchedLodge: photo("1566073771259-6a8506099945"),
    resortDusk: photo("1571896349842-33c89424de2d"),
    beachDeck: photo("1582719508461-905c673771fd"),
    gardenHouse: photo("1583608205776-bfd35f0d9f83"),
    redRoofCottage: photo("1576941089067-2de3c901e126"),
    tinyHouse: photo("1518780664697-55e3ad937233"),
    familyHome: photo("1605276374104-dee2a0ed3cd6"),
    boldModern: photo("1600047509807-ba8f99d2cdde"),
    cliffBed: photo("1596394516093-501ba68a0ba6"),
    whiteVillaPool: photo("1613977257363-707ba9348227"),
    darkVillaPool: photo("1602343168117-bb8ffe3e2e9f"),
    cityBuilding: photo("1600585154526-990dced4db0d"),
    // living rooms
    livingPlants: photo("1502672260266-1c1ef2d93688"),
    livingRedChair: photo("1522708323590-d24dbb6b0267"),
    livingBlueSofa: photo("1493809842364-78817add7ffb"),
    livingCoastal: photo("1505691938895-1758d7feb511"),
    livingBright: photo("1560448204-e02f11c3d0e2"),
    livingYellowChair: photo("1586023492125-27b2c045efd7"),
    livingOpenPlan: photo("1600607687939-ce8a6c25118c"),
    livingGallery: photo("1600210492486-724fe5c67fb0"),
    livingEarthy: photo("1618221195710-dd6b41faaea6"),
    livingTeal: photo("1554995207-c18c203602cb"),
    livingGlassStairs: photo("1600573472550-8090b5e0745e"),
    livingWhite: photo("1598928506311-c55ded91a20c"),
    livingDusk: photo("1564078516393-cf04bd966897"),
    livingMonochrome: photo("1600121848594-d8644e57abab"),
    livingWarm: photo("1533779283484-8ad4940aa3a8"),
    livingFireplace: photo("1501183638710-841dd1904471"),
    // kitchens and dining
    kitchenWhite: photo("1484154218962-a197022b5858"),
    kitchenRange: photo("1556912173-3bb406ef7e77"),
    kitchenIsland: photo("1507089947368-19c1da9775ae"),
    diningRoom: photo("1560185007-cde436f6a4d0"),
    diningGreen: photo("1617806118233-18e1de247200"),
    // bedrooms
    bedroomGrey: photo("1522771739844-6a9f6d5f14af"),
    bedroomOrange: photo("1540518614846-7eded433c457"),
    bedroomVelvet: photo("1616594039964-ae9021a400a0"),
    bedroomWood: photo("1611892440504-42a792e24d32"),
    bedroomClassic: photo("1631049307264-da0ec9d70304"),
    bedroomWhite: photo("1595526114035-0d45ed16cfbf"),
    bedroomLuxe: photo("1590490360182-c33d57733427"),
    bedroomGlass: photo("1578683010236-d716f9a3f461"),
    bedroomBoho: photo("1615874959474-d609969a20ed"),
    // bathrooms and details
    bathroomWhite: photo("1552321554-5fefe8c9ef14"),
    bathroomWood: photo("1600488999585-e4364713b90a"),
    staircase: photo("1502005229762-cf1b2da7c5d6"),
};

const HOUSE_RULES = "No smoking indoors. No parties or events. Quiet hours after 10pm.";

// Listed in the order they should appear on the home page (newest first).
const LISTINGS = [
    {
        title: "Oceanfront villa with infinity pool",
        address: "Diani Beach, Kwale",
        photos: [P.poolVilla, P.livingCoastal, P.kitchenRange, P.bedroomOrange, P.bathroomWhite, P.beachDeck],
        description: "A breezy whitewashed villa a short walk from Diani's powder-white sand. Swim in the private infinity pool, then watch the monkeys in the palms from the upper terrace.",
        perks: ["Wifi", "Free Parking", "Swimming Pool", "Public Tv"],
        price: 38000, maxGuests: 8, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Tented camp suite on the Mara plains",
        address: "Maasai Mara, Narok",
        photos: [P.thatchedLodge, P.bedroomWood, P.livingEarthy, P.bedroomWhite, P.bathroomWood],
        description: "Wake up to the sound of the savannah in a thatched lodge on the edge of the reserve. Game drives, sundowners and a pool deck overlooking the plains.",
        perks: ["Wifi", "Swimming Pool", "Free Parking"],
        price: 45000, maxGuests: 4, checkIn: "12:00", checkOut: "10:00",
    },
    {
        title: "Architect's house under the acacia",
        address: "Karen, Nairobi",
        photos: [P.treeModern, P.livingOpenPlan, P.diningGreen, P.bedroomVelvet, P.staircase],
        description: "Glass, timber and a huge old acacia. Minutes from the Giraffe Centre and Karen Blixen Museum, with a quiet garden that feels miles from the city.",
        perks: ["Wifi", "Free Parking", "Public Tv", "Pets Allowed"],
        price: 24000, maxGuests: 6, checkIn: "15:00", checkOut: "11:00",
    },
    {
        title: "Lakeview farmhouse with wraparound porch",
        address: "Naivasha, Nakuru",
        photos: [P.farmhouse, P.livingBright, P.diningRoom, P.bedroomClassic, P.bedroomBoho],
        description: "Classic farmhouse with a wraparound porch, big lawns and hippos in the lake at dusk. Perfect for a family weekend with Hell's Gate on the doorstep.",
        perks: ["Wifi", "Free Parking", "Pets Allowed"],
        price: 16500, maxGuests: 8, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Overwater beach bungalow",
        address: "Shela, Lamu Island",
        photos: [P.beachBungalow, P.beachDeck, P.bedroomWood, P.bathroomWhite],
        description: "Swahili-style bungalow right on the water. Dhow trips at sunset, fresh seafood in Shela village, and not a car on the island.",
        perks: ["Wifi"],
        price: 31000, maxGuests: 2, checkIn: "13:00", checkOut: "10:00",
    },
    {
        title: "A-frame retreat at the foot of Mt Kenya",
        address: "Nanyuki, Laikipia",
        photos: [P.aFrameCabin, P.livingDusk, P.bedroomLuxe, P.diningRoom],
        description: "A cosy A-frame with a wood-burning stove and snow-capped views on clear mornings. Close to Ol Pejeta Conservancy and the equator crossing.",
        perks: ["Wifi", "Free Parking", "Pets Allowed"],
        price: 13500, maxGuests: 5, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Modern white villa with private pool",
        address: "Nyali, Mombasa",
        photos: [P.whitePoolVilla, P.livingOpenPlan, P.kitchenIsland, P.bedroomWhite, P.bathroomWood],
        description: "Sleek beach villa in leafy Nyali, ten minutes from Old Town and Fort Jesus. Private pool, rooftop lounge and a fully equipped kitchen.",
        perks: ["Wifi", "Free Parking", "Swimming Pool", "Public Tv"],
        price: 29500, maxGuests: 6, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Tropical pool resort suite",
        address: "Watamu, Kilifi",
        photos: [P.tropicalResort, P.resortDusk, P.bedroomOrange, P.livingPlants, P.bathroomWhite],
        description: "A garden suite in a boutique resort beside the Watamu Marine Park. Snorkel with turtles in the morning and lounge by the lagoon pool all afternoon.",
        perks: ["Wifi", "Swimming Pool", "Free Parking"],
        price: 22000, maxGuests: 4, checkIn: "14:00", checkOut: "10:00",
    },
    {
        title: "Minimalist townhouse near Westlands",
        address: "Westlands, Nairobi",
        photos: [P.whiteMinimal, P.livingYellowChair, P.kitchenWhite, P.bedroomGrey, P.bathroomWhite],
        description: "Bright, calm and close to everything: Sarit Centre, the Westgate area and Nairobi's best restaurants. Fast Wi-Fi and a dedicated workspace.",
        perks: ["Wifi", "Free Parking", "Public Tv"],
        price: 9500, maxGuests: 3, checkIn: "15:00", checkOut: "11:00",
    },
    {
        title: "Timber cottage in the tea hills",
        address: "Limuru, Kiambu",
        photos: [P.forestCottage, P.livingWarm, P.bedroomGlass, P.bathroomWood],
        description: "A brick-and-timber cottage among tall trees and tea estates. Misty mornings, a fireplace at night, and Nairobi only 45 minutes away.",
        perks: ["Wifi", "Free Parking", "Pets Allowed"],
        price: 8500, maxGuests: 4, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Contemporary villa with glass staircase",
        address: "Kilifi Creek, Kilifi",
        photos: [P.whiteVillaPool, P.livingGlassStairs, P.livingCoastal, P.bedroomGlass, P.bathroomWood],
        description: "Designer villa on Kilifi Creek with a floating glass staircase and a pool that looks out to the water. Kitesurfing and dhow cruises nearby.",
        perks: ["Wifi", "Free Parking", "Swimming Pool", "Public Tv"],
        price: 34000, maxGuests: 6, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Sunset cabin on the escarpment",
        address: "Kijabe, Rift Valley",
        photos: [P.sunsetCabin, P.cliffBed, P.livingFireplace, P.bedroomGrey],
        description: "A tiny cabin perched on the Great Rift Valley escarpment. The sunsets are the main event, followed by stars you can't see in the city.",
        perks: ["Free Parking", "Pets Allowed"],
        price: 7800, maxGuests: 2, checkIn: "14:00", checkOut: "10:00",
    },
    {
        title: "Poolside house with lap pool",
        address: "Malindi, Kilifi",
        photos: [P.lapPoolModern, P.darkVillaPool, P.livingRedChair, P.livingTeal, P.bedroomOrange, P.bathroomWhite],
        description: "Swim laps in the long pool, then head to Malindi's Italian cafés and the Marine National Park. Air-conditioned bedrooms and a shaded terrace.",
        perks: ["Wifi", "Free Parking", "Swimming Pool", "Public Tv"],
        price: 26500, maxGuests: 6, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Family home in a quiet estate",
        address: "Runda, Nairobi",
        photos: [P.familyHome, P.livingWhite, P.kitchenIsland, P.bedroomVelvet, P.diningGreen],
        description: "A spacious four-bedroom home in a gated estate with a big garden for the kids. Near the UN complex and Village Market.",
        perks: ["Wifi", "Free Parking", "Public Tv", "Pets Allowed"],
        price: 18500, maxGuests: 8, checkIn: "15:00", checkOut: "11:00",
    },
    {
        title: "Garden house with mountain views",
        address: "Nyeri, Nyeri",
        photos: [P.gardenHouse, P.livingBlueSofa, P.bedroomBoho, P.kitchenRange],
        description: "A tropical garden house on the slopes of the Aberdares. Walk to coffee farms, visit Baden-Powell's grave, or just enjoy the birdsong.",
        perks: ["Wifi", "Free Parking"],
        price: 6500, maxGuests: 4, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Sleek modern home in Kilimani",
        address: "Kilimani, Nairobi",
        photos: [P.boldModern, P.livingMonochrome, P.kitchenWhite, P.bedroomWhite],
        description: "Contemporary home on a quiet Kilimani street, walking distance to Yaya Centre and some of the city's best coffee.",
        perks: ["Wifi", "Free Parking", "Public Tv"],
        price: 12000, maxGuests: 4, checkIn: "15:00", checkOut: "11:00",
    },
    {
        title: "Red-roof cottage near Lake Nakuru",
        address: "Nakuru, Nakuru",
        photos: [P.redRoofCottage, P.livingGallery, P.bedroomClassic, P.kitchenWhite],
        description: "Storybook cottage with a red roof and flower boxes, a short drive from the flamingos and rhinos of Lake Nakuru National Park.",
        perks: ["Wifi", "Free Parking", "Pets Allowed"],
        price: 7200, maxGuests: 5, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Resort villa with lagoon pool",
        address: "Vipingo, Kilifi",
        photos: [P.modernPoolVilla, P.resortDusk, P.livingPlants, P.bedroomLuxe, P.bathroomWood],
        description: "A modern villa in a golf and beach resort. Lagoon pool, ocean breezes and a chef on request.",
        perks: ["Wifi", "Free Parking", "Swimming Pool", "Public Tv"],
        price: 36000, maxGuests: 6, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Tiny house on a tea-country hill",
        address: "Kericho, Kericho",
        photos: [P.tinyHouse, P.livingTeal, P.bedroomGrey],
        description: "A bright red tiny house surrounded by rolling tea plantations. Compact, clever and wonderfully quiet.",
        perks: ["Wifi", "Free Parking"],
        price: 4500, maxGuests: 2, checkIn: "14:00", checkOut: "10:00",
    },
    {
        title: "City loft with skyline views",
        address: "Upper Hill, Nairobi",
        photos: [P.cityBuilding, P.livingDusk, P.livingWarm, P.bedroomLuxe, P.bathroomWhite],
        description: "A high-floor loft with floor-to-ceiling windows over the Nairobi skyline. Gym, rooftop pool and 24-hour security in the building.",
        perks: ["Wifi", "Free Parking", "Swimming Pool", "Public Tv"],
        price: 11000, maxGuests: 2, checkIn: "15:00", checkOut: "11:00",
    },
    {
        title: "Timber-clad eco house by the lake",
        address: "Dunga Beach, Kisumu",
        photos: [P.timberModern, P.livingEarthy, P.diningRoom, P.bedroomWood, P.staircase],
        description: "Solar-powered eco house on the shores of Lake Victoria. Catch the sunset over the lake and try fresh tilapia at Dunga Beach.",
        perks: ["Wifi", "Free Parking", "Pets Allowed"],
        price: 10500, maxGuests: 4, checkIn: "14:00", checkOut: "11:00",
    },
    {
        title: "Whitewashed hideaway with plunge pool",
        address: "Tiwi Beach, Kwale",
        photos: [P.whiteModern, P.livingCoastal, P.kitchenRange, P.bedroomGlass],
        description: "A quiet whitewashed hideaway on Tiwi's rock pools and coral beaches. Plunge pool, hammock and complete privacy.",
        perks: ["Wifi", "Free Parking", "Swimming Pool"],
        price: 14500, maxGuests: 4, checkIn: "14:00", checkOut: "11:00",
    },
];

const findOrCreateDemoHost = async () => {
    const existing = await User.findOne({ email: DEMO_HOST.email });
    if (existing) return { host: existing, password: null };
    const password = crypto.randomBytes(9).toString("base64url");
    const host = await User.create({ ...DEMO_HOST, password: bcrypt.hashSync(password, 10) });
    return { host, password };
};

const removeDemoListings = async (host) => {
    const placeIds = (await Place.find({ owner: host._id }, "_id")).map((p) => p._id);
    const bookings = await Booking.deleteMany({ place: { $in: placeIds } });
    const places = await Place.deleteMany({ _id: { $in: placeIds } });
    return { places: places.deletedCount, bookings: bookings.deletedCount };
};

(async () => {
    if (!process.env.MONGO_URL) throw new Error("MONGO_URL is not set (api/.env).");
    await mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 10000 });
    const { host: dbName } = mongoose.connection;
    console.log(`Connected to ${dbName}/${mongoose.connection.name}`);

    const { host, password } = await findOrCreateDemoHost();
    const removed = await removeDemoListings(host);
    console.log(`Removed ${removed.places} demo listings and ${removed.bookings} bookings on them.`);

    if (process.argv.includes("--clear")) return;

    // Insert oldest first, one second apart, so the home page (newest first)
    // shows them in LISTINGS order.
    const start = Date.now() - LISTINGS.length * 1000;
    const docs = [...LISTINGS].reverse().map((listing, i) => ({
        ...listing,
        owner: host._id,
        extraInfo: HOUSE_RULES,
        createdAt: new Date(start + i * 1000),
        updatedAt: new Date(start + i * 1000),
    }));
    const inserted = await Place.insertMany(docs, { timestamps: false });
    console.log(`Created ${inserted.length} demo listings owned by ${DEMO_HOST.email}.`);
    if (password) {
        console.log(`Demo host created. Log in as ${DEMO_HOST.email} / ${password} to edit the listings (shown once).`);
    }
})()
    .catch((error) => {
        console.error("Seeding failed:", error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
