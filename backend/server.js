// server.js
require("dotenv").config();
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const express = require("express");
const cors = require("cors");
const { Pool } = require('pg');
const {S3Client,
  DeleteObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");
const { ensureBucket, createUploader } = require("./services/image-upload");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

// Add path module
const path = require('path');
const fs = require('fs'); // For reading SSL certificate

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from "public"
app.use(express.static('public'));

const BUCKET = process.env.S3_BUCKET;
const PORT = process.env.PORT || 3000;
const AWS_REGION = process.env.AWS_REGION;

// Validate environment variables
if (!AWS_REGION || !BUCKET || !process.env.DB_SECRET_ARN || !process.env.DB_HOST) {
  console.error("❌ Missing required environment variables: AWS_REGION, S3_BUCKET, DB_SECRET_ARN, and DB_HOST must be set.");
  process.exit(1);
}

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined // Let AWS SDK fall back to IAM roles in cloud
});

// Initialize Secrets Manager Client
const secretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Function to fetch database credentials from AWS Secrets Manager
async function getDatabaseCredentials() {
  try {
    const command = new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_NAME });
    const response = await secretsManagerClient.send(command);
    const secret = JSON.parse(response.SecretString);
    return {
      username: secret.username,
      password: secret.password,
      database: secret.dbname,
    };
  } catch (err) {
    console.error("❌ Error retrieving database credentials:", err);
    throw err;
  }
}

// Function to create database connection pool
async function createDatabasePool() {
  const creds = await getDatabaseCredentials();
  const connectionString = `postgres://${creds.username}:${creds.password}@${process.env.DB_HOST}:${process.env.DB_PORT}/${creds.database}`;

  const poolConfig = {
    connectionString,
  };

  // Check if SSL certificate file exists
  const certPath = path.join(__dirname, 'eu-west-1-bundle.pem');
  const certExists = fs.existsSync(certPath);

  if (certExists) {
    // Use SSL with certificate if available
    console.log('✅ Using SSL with eu-west-1-bundle.pem');
    poolConfig.ssl = {
      ca: fs.readFileSync(certPath).toString(),
    };
  } else {
    // Fallback for testing without SSL verification
    console.log('⚠️ SSL certificate not found, using unverified SSL for testing');
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolConfig);
  pool.on('error', (err) => {
    console.error('❌ Database pool error:', err);
  });
  return pool;
}




// Log environment variables for debugging
console.log(`Initializing S3 client with region: ${process.env.AWS_REGION}, bucket: ${BUCKET}`);

// Ensure images table exists
async function ensureTable(pool) {
  try{
    // Check if the table exists
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'images'
      );
    `;

    const checkResult = await pool.query(checkQuery);
    const tableExists = checkResult.rows[0].exists;

    if (tableExists) {
      console.log('✅ Images table already exists.');
      return;
    }
  
    // Create the images table if it doesn't exist
    const createQuery = `
      CREATE TABLE IF NOT EXISTS images (
        id SERIAL PRIMARY KEY,
        s3_key VARCHAR(255) NOT NULL,
        s3_url VARCHAR(255) NOT NULL,
        file_name VARCHAR(255),
        file_description TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await pool.query(createQuery);
    console.log('✅ Images table is ready.');
  } catch (err) {
    console.error('❌ Error checking or creating images table:', err);
    throw err;
  }
}


// Start server after ensuring bucket and table
(async () => {
  try {
    await ensureBucket(BUCKET);
    console.log(`✅ Successfully verified or created bucket: ${BUCKET}`);

    const pool = await createDatabasePool();
    console.log('✅ Database connection established');

    await ensureTable(pool);
  
    // Middleware to upload image to S3
    const upload = createUploader(BUCKET);

  //Upload endpoint
    app.post("/upload", upload, async(req, res,next) => {
      try {
        const s3Key = req.s3Key;
        const s3Url = req.s3Url;
        const fileName = req.file.originalname;
        const fileDescription = req.body.description || '';
        const query = 'INSERT INTO images (s3_key, s3_url, file_name, file_description) VALUES ($1, $2, $3, $4) RETURNING id';
        const result = await pool.query(query, [s3Key, s3Url, fileName, fileDescription]);
        const imageId = result.rows[0].id;
        console.log(`Uploaded image to: ${s3Url}, saved to database with id: ${imageId}`);
        res.json({ id: imageId, url: s3Url });
      } catch (err) {
        console.error('❌ Error uploading image:', err);
        next(err);
      }
    });

  //1. Fetch images endpoint
    app.get("/images", async (req, res, next) => {
      try {
        const size = parseInt(req.query.size) || 3; // Default to 3 if not provided
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * size;
        
        const query = 'SELECT id, s3_key, s3_url, file_name,file_description, uploaded_at FROM images ORDER BY uploaded_at DESC LIMIT $1 OFFSET $2';
        const result = await pool.query(query, [size, offset]);

        const images_data = await Promise.all(result.rows.map(async (row) => {
          const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: row.s3_key });
          const presignedUrl = await getSignedUrl(s3Client, cmd, { expiresIn: 3600 });
          return {
            id: row.id,
            key: row.s3_key,
            url: presignedUrl,
            fileName: row.file_name,
            fileDescription: row.file_description,
            uploadedAt: row.uploaded_at
          }
        }));

        const countQuery = 'SELECT COUNT(*) FROM images';
        const countResult = await pool.query(countQuery);
        const totalImages = parseInt(countResult.rows[0].count);
        const hasMore = offset + size < totalImages;

        res.json({
          images_data,
          nextPage: hasMore ? page + 1 : undefined
        });

      } catch (err) {
        console.error('❌ Error fetching images:', err);
        next(err);
      }
    });

  // 2. Delete image endpoint
    app.delete("/images/:key", async (req, res, next) => {
      try {
        const id = req.params.id;
        const query = 'SELECT s3_key FROM images WHERE id = $1';
        const result = await pool.query(query, [id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Image not found' });
        }
        const s3Key = result.rows[0].s3_key;

        const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key });
        await s3Client.send(cmd);

        const deleteQuery = 'DELETE FROM images WHERE id = $1';
        await pool.query(deleteQuery, [id]);

        console.log(`✅ Successfully deleted image with id: ${id}, key: ${s3Key}`);
        res.status(204).end();
      } catch (err) {
        console.error('❌ Error deleting image:', err);
        next(err);
      }
    });

    // Catch-all route for SPA
    app.get(/^(?!\/api|\/upload|\/images|\/config\.js).*/, (req, res) => {
      console.log(`Serving SPA index.html for path: ${req.path}`);
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Error handler (must come after all routes)
    app.use((err, _req, res, _next) => {
      console.error(`❌ Server error: ${err.message}`, err.stack);
      res.status(500).json({ error: err.message, details: err.code || 'Unknown' });
    });

    // Start listening
    app.listen(PORT || 3000, '0.0.0.0', () => {
      console.log(`🚀 Backend running at http://localhost:${PORT}`);
    });


  } catch (err) {
    console.error("❌ Failed to setup bucket or table:", err);
    process.exit(1);
  }
})();
