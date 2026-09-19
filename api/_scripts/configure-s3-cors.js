// Browsers upload photos straight to S3 with presigned PUT URLs, so the bucket
// must allow cross-origin PUTs from the app's origins.
//
//   npm run s3:cors                                  # default origins below
//   CORS_ORIGINS="https://a.com,https://b.com" npm run s3:cors
//
// Needs s3:PutBucketCors on the bucket (uses the same S3_* env vars as the API).
require("dotenv").config({ quiet: true });
const { PutBucketCorsCommand, GetBucketCorsCommand } = require("@aws-sdk/client-s3");
const { loadConfig } = require("../_src/config");
const { createPhotoStorage } = require("../_src/lib/s3");

const { client, bucket: BUCKET } = createPhotoStorage(loadConfig().s3);
const s3 = () => client;

const DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "https://mernbnb.vercel.app",
    "https://kibe-mernbnb.vercel.app",
];
const origins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;

(async () => {
    await s3().send(
        new PutBucketCorsCommand({
            Bucket: BUCKET,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedOrigins: origins,
                        AllowedMethods: ["PUT", "GET", "HEAD"],
                        AllowedHeaders: ["*"],
                        ExposeHeaders: ["ETag"],
                        MaxAgeSeconds: 3600,
                    },
                ],
            },
        })
    );
    const { CORSRules } = await s3().send(new GetBucketCorsCommand({ Bucket: BUCKET }));
    console.log(`CORS on ${BUCKET}:`, JSON.stringify(CORSRules, null, 2));
})().catch((error) => {
    console.error("Failed to configure bucket CORS:", error.message);
    process.exit(1);
});
