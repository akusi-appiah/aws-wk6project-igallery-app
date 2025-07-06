// services/image-upload.js
const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand
} = require('@aws-sdk/client-s3');

const { Upload } = require('@aws-sdk/lib-storage');
const multer = require('multer');
const stream = require('stream');

// 1. Create S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined 
});

// 2. Ensure the S3 bucket exists
async function ensureBucket(bucketName) {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`✅ Bucket "${bucketName}" exists.`);
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
      console.log(`✅ Bucket "${bucketName}" created.`);
    } else {
      throw err;
    }
  }
}

// 3. Create uploader middleware using `multer` (local to memory)
function createUploader(bucketName) {
  const storage = multer.memoryStorage(); // buffer instead of local file system

  const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image uploads allowed'), false);
      }
      cb(null, true);
    }
  });

  // Wrap middleware and upload-to-s3 logic in one
  return (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
      if (err) return next(err);

      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      try {
        const passThrough = new stream.PassThrough();
        passThrough.end(file.buffer);

        // Upload to S3
        const key = `uploads/${Date.now()}-${file.originalname}`;

        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: bucketName,
            Key: key,
            Body: passThrough,
            ContentType: file.mimetype
          }
        });

        const result = await upload.done();
        req.s3Key = key;
        req.s3Url = result.Location;
        next();
      } catch (uploadErr) {
        next(uploadErr);
      }
    });
  };
}

module.exports = { ensureBucket, createUploader };
