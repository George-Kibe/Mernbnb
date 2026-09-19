// Test helpers. Source modules are loaded with Node's require (like the app
// does) so tests and app share one instance of mongoose, models and spies.
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Writable } = require("stream");
const { loadConfig } = require("../_src/config");
const { createLogger } = require("../_src/logger");
const { createDatabase } = require("../_src/db");
const { createPhotoStorage } = require("../_src/lib/s3");
const { createApp } = require("../_src/app");
const { signToken } = require("../_src/middleware/auth");
const User = require("../_src/models/User");
const Place = require("../_src/models/Place");
const Booking = require("../_src/models/Booking");
const PasswordReset = require("../_src/models/PasswordReset");

const JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
const silentLogger = createLogger({ env: "test", logLevel: "silent" });

// A logger that keeps what it writes: `lines` holds the parsed JSON entries.
// find(message) returns the first entry with that message.
const captureLogger = (logLevel = "debug") => {
    const lines = [];
    const stream = new Writable({
        write(chunk, encoding, done) {
            lines.push(JSON.parse(chunk));
            done();
        },
    });
    const logger = createLogger({ env: "production", logLevel }, { stream });
    const find = (message) => lines.find((line) => (message instanceof RegExp ? message.test(line.message) : line.message === message));
    return { logger, lines, find };
};

const testStorage = (overrides = {}) =>
    createPhotoStorage(
        { bucket: "test-bucket", region: "eu-west-1", accessKeyId: "AKIATEST", secretAccessKey: "secret", ...overrides },
        { logger: silentLogger }
    );

// A fresh app on its own database. `env` overrides config values.
const makeApp = ({ mongoUri, env = {}, storage = testStorage(), fetchImage, now, db, loadShell, mailer, logger = silentLogger } = {}) => {
    const config = loadConfig({
        NODE_ENV: "test",
        JWT_SECRET,
        MONGO_URL: mongoUri,
        RATE_LIMIT_MAX: "10000",
        AUTH_RATE_LIMIT_MAX: "10000",
        WRITE_RATE_LIMIT_MAX: "10000",
        UPLOAD_RATE_LIMIT_MAX: "10000",
        RESET_RATE_LIMIT_MAX: "10000",
        ...env,
    });
    const database = db ?? createDatabase(config.mongoUrl, logger);
    const app = createApp({ config, logger, db: database, storage, fetchImage, now, loadShell, mailer });
    return { app, config, db: database, storage };
};

// "mongodb://127.0.0.1:1234/" -> a unique database for this test file.
const databaseUri = (baseUri) => `${baseUri}airbuenas-test-${crypto.randomUUID().slice(0, 8)}`;

const PASSWORD = "correct horse battery";
let passwordHash;

const createUser = async (fields = {}) => {
    passwordHash ??= await bcrypt.hash(PASSWORD, 4);
    const user = await User.create({
        name: "Test User",
        email: `user-${crypto.randomUUID().slice(0, 8)}@example.com`,
        password: passwordHash,
        ...fields,
    });
    const token = signToken(user, { secret: JWT_SECRET, expiresIn: "1h" });
    return { user, token, auth: `Bearer ${token}` };
};

const placeFields = (overrides = {}) => ({
    title: "Lakeside Cabin",
    address: "Naivasha, Nakuru",
    photos: ["places/abc/cover.jpg"],
    description: "Quiet cabin on the lake.",
    perks: ["Wifi"],
    extraInfo: "No parties.",
    checkIn: "14:00",
    checkOut: "11:00",
    maxGuests: 4,
    price: 5000,
    ...overrides,
});

const createPlace = (owner, overrides = {}) => Place.create({ owner: owner._id, ...placeFields(overrides) });

const createBooking = (place, guest, overrides = {}) =>
    Booking.create({
        place: place._id,
        owner: guest._id,
        checkIn: new Date("2030-01-10T00:00:00Z"),
        checkOut: new Date("2030-01-13T00:00:00Z"),
        guests: 2,
        name: "Guest",
        phoneNumber: "+254 700 000000",
        price: 15000,
        ...overrides,
    });

// A mailer that keeps what it's asked to send in `sent`.
const fakeMailer = () => {
    const sent = [];
    return { enabled: true, transport: "fake", sent, send: async (message) => { sent.push(message); return { messageId: `m${sent.length}` }; } };
};

const clearDatabase = async () => {
    await Promise.all([User.deleteMany({}), Place.deleteMany({}), Booking.deleteMany({}), PasswordReset.deleteMany({})]);
};

const closeDatabase = async () => {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
};

module.exports = {
    JWT_SECRET, PASSWORD, silentLogger, captureLogger, testStorage, makeApp, databaseUri, createUser, placeFields,
    createPlace, createBooking, clearDatabase, closeDatabase, fakeMailer, User, Place, Booking, PasswordReset,
};
