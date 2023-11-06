const express = require('express');
const sharp = require('sharp');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const AWS = require('aws-sdk');
const redis = require('redis');
const JSZip = require('jszip');
const router = express.Router();

require('dotenv').config();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "ap-southeast-2",
});

const bucketName = 'n11079550bucket';
const s3 = new AWS.S3({ apiVersion: "2006-03-01" });

(async () => {
  try {
    await s3.createBucket({ Bucket: bucketName }).promise();
    console.log(`Created bucket: ${bucketName}`);
  } catch (err) {
    // We will ignore 409 errors which indicate that the bucket already exists
    if (err.statusCode !== 409) {
      console.log(`Error creating bucket: ${err}`);
    }
  }
})();

const client = redis.createClient();
(async () => {
  try {
    await  client.connect();
  } catch (err) {
    console.log(err);
  }
})();

const uploadedFileNames = []; // Array to store uploaded file names
const uploadedImages = []; // Array to store uploaded images

(async () => {
  try {
    await s3.createBucket({ Bucket: bucketName }).promise();
    console.log(`Created bucket: ${bucketName}`);
  } catch (err) {
    if (err.statusCode !== 409) {
      console.log(`Error creating bucket: ${err}`);
    }
  }
})();

router.get('/', function(req, res, next) {
  if (!req.session.uploadedImages) {
    req.session.uploadedImages = ['../images/default.jpg'];
    console.log("default");
  }

  res.render('index', {
    title: 'Express',
    uploadedImages: req.session.uploadedImages,
  });
});

// Endpoint to resize the uploaded image
// Endpoint to resize the uploaded image
router.post('/resize', upload.array('images', 10), async function(req, res) {
  try {
    // If the session doesn't contain uploadedImages, initialize it
    if (!req.session.uploadedImages) {
      req.session.uploadedImages = [];
    } else if (req.session.uploadedImages.includes('../images/default.jpg')) {
      // If the session contains the default image, remove it before adding new images
      req.session.uploadedImages = [];
    }

    let imagesProcessed = [];

    // Use Promise.all to wait for all images to be processed
    await Promise.all(req.files.map(async file => {
      let imageBuffer = file.buffer; // Buffer containing the uploaded image
      let width = parseInt(req.body.width); // Desired width for the resized image
      let height = parseInt(req.body.height); // Desired height for the resized image
      let imageType = req.body.imageType || 'jpeg'; // Image type/format (default is jpeg)
      let imageQuality = parseInt(req.body.imageQuality) || 90; // Quality of the image (default is 90)
      let maintainAspectRatio = req.body.maintainAspectRatio === 'on'; // Check if aspect ratio needs to be maintained

      // Define the resize options
      let resizeOptions = {
        width: width,
        fit: maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill, // Resize strategy based on aspect ratio preference
      };
      if (height) {
        resizeOptions.height = height;
      }

      // Use Sharp to process and resize the image
      let sharpInstance = sharp(imageBuffer).resize(resizeOptions);
      if (imageType === 'jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: imageQuality });
      } else if (imageType === 'png') {
        sharpInstance = sharpInstance.png({ quality: imageQuality });
      } else if (imageType === 'webp') {
        sharpInstance = sharpInstance.webp({ quality: imageQuality });
      }

      let outputBuffer = await sharpInstance.toBuffer(); // Get the resized image buffer

      // Generate a cache key and file name
      let cacheKey = `${width}-${height}-${file.originalname}`;
      let resizedFileName = `resized-${width}x${height}-${file.originalname}`;

      // Attempt to retrieve the image from the Redis cache
      const result = await client.get(cacheKey);
      if (!result) {
        // If not found in cache, upload to S3 and then cache
        let uploadParams = {
          Bucket: bucketName,
          Key: `resized-images/${resizedFileName}`, // Include width and height in the S3 Key
          Body: outputBuffer,
          ContentType: `image/${imageType}`
        };

        await s3.upload(uploadParams).promise();
        await client.setEx(cacheKey, 3600, outputBuffer.toString('base64'));
      }

      // Add the resized image's buffer and type to the array for rendering or downloading
      imagesProcessed.push({
        buffer: outputBuffer,
        type: imageType,
        name: resizedFileName
      });

      // Add the image path to the session
      req.session.uploadedImages.push(`../images/${resizedFileName}`);
    }));

    // Check if the client wants the images as a download
    let download = req.body.download === 'on';
    if (download) {
      // Code for bundling the images into a zip for download will go here
      // ...
    } else {
      // Render the page with all resized images
      res.render('index', {
        title: 'Cloud Resizer',
        uploadedImages: req.session.uploadedImages
      });
    }
  } catch (error) {
    console.error('An error occurred:', error);
    res.render('index', {
      title: 'Cloud Resizer',
      error: error.message
    });
  }
});

const { promisify } = require('util');
const redisGetAsync = promisify(client.get).bind(client);

router.get('/download/:index', async function(req, res) {
  try {
    const index = parseInt(req.params.index);

    if (index >= 0 && index < uploadedFileNames.length) {
      const fileName = uploadedFileNames[index];

      const cacheKey = `image-${fileName}`;
      console.log(cacheKey);
      const imageFromRedis = await client.get(cacheKey);
      if (imageFromRedis) {
        console.log("cacheKey");
        res.setHeader('Content-Disposition', `attachment; filename=resized-image-${fileName}`);
        res.setHeader('Content-Type', 'image/jpeg');
        res.end(Buffer.from(imageFromRedis, 'base64'));
      } else {
        const imageFromS3Key = `resized-images/${fileName}`;

        s3.getObject({ Bucket: bucketName, Key: imageFromS3Key }, (err, data) => {
          if (data) {
            const imageBuffer = data.Body;
            client.setEx(cacheKey, 3600, imageBuffer.toString('base64'));
            res.setHeader('Content-Disposition', `attachment; filename=${imageFromS3Key}`); // Use the S3 Key with width and height
            res.setHeader('Content-Type', 'image/jpeg');
            res.end(imageBuffer);
          } else {
            res.status(404).send('Image not found');
          }
        });
      }
    } else {
      res.status(404).send('Image not found');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;