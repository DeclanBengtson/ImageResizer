const express = require('express');
const sharp = require('sharp');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const fs = require('fs').promises;
const AWS = require('aws-sdk');
const redis = require('redis');
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
router.post('/resize', upload.single('image'), async function(req, res) {
  try {
    // If the session contains the default image, remove it before adding new images
    if (req.session.uploadedImages && req.session.uploadedImages[0] === '../images/default.jpg') {
      req.session.uploadedImages.shift();
    }

    // Add the new image path to the session
    if (!req.session.uploadedImages) {
      req.session.uploadedImages = [];
    }
    //req.session.uploadedImages.push('../images/' + req.file.originalname);

    // Extract and configure image parameters for resizing
    let imageBuffer = req.file.buffer;  // Buffer containing the uploaded image
    let width = parseInt(req.body.width);  // Desired width for the resized image
    let height = parseInt(req.body.height);  // Desired height for the resized image
    let imageType = req.body.imageType || 'jpeg';  // Image type/format (default is jpeg)
    let imageQuality = parseInt(req.body.imageQuality) || 90;  // Quality of the image (default is 90)
    let maintainAspectRatio = req.body.maintainAspectRatio === 'on';  // Check if aspect ratio needs to be maintained

    // Define the resize options
    let resizeOptions = {
      width: width,
      fit: maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill  // Resize strategy based on aspect ratio preference
    };
    if (height) {
      resizeOptions.height = height;
    }

    // Use Sharp to process and resize the image
    let sharpInstance = sharp(imageBuffer).resize(resizeOptions);
    // Configure image type and quality with Sharp
    if (imageType === 'jpeg') {
      sharpInstance = sharpInstance.jpeg({ quality: imageQuality });
    } else if (imageType === 'png') {
      sharpInstance = sharpInstance.png();
    } else if (imageType === 'gif') {
      sharpInstance = sharpInstance.gif();
    }

    let outputBuffer = await sharpInstance.toBuffer();  // Get the resized image buffer

    let cacheKey = `${req.body.width}-${req.body.height}-${req.file.originalname}`;

    // Check if the image is in Redis; if not, check if it is in S3; if not, upload to both
    const result = await client.get(cacheKey);
    if (result) {
      console.log(`Found in Redis Cache`);
    } else {
      try {
        // Create an S3 upload parameters object
        let uploadParams = {
          Bucket: bucketName,
          Key: `resized-images/${req.body.width}-${req.body.height}-${req.file.originalname}`, // Include width and height in the S3 Key
          ContentType: 'image/' + imageType
        };

        // Upload the image to AWS S3
        let uploadResult = await s3.upload({
          ...uploadParams,
          Body: outputBuffer // Set the image data as Body
        }).promise();

        console.log(`Uploaded to S3`);

        // Store the file name
        uploadedFileNames.push(req.file.originalname);
        
        // Upload to Redis cache
        await client.setEx(cacheKey, 3600, outputBuffer.toString('base64'));
        console.log(`Stored in Redis cache`);
      } catch (error) {
        console.error("Error in S3 operation:", error);
      }
    }

    // Check if the client wants the image as a download
    let download = req.body.download === 'on';

    if (download) {
      res.setHeader('Content-Disposition', 'attachment; filename=resized-image.' + imageType);
      res.setHeader('Content-Type', req.file.mimetype);
      res.end(outputBuffer);
    } else {
      // Otherwise, render the page with the resized image (encoded in Base64 format)
      let outputBase64 = `data:image/${imageType};base64,` + outputBuffer.toString('base64');
      uploadedImages.push(outputBase64); // Store the resized image in the uploadedImages array
      return res.render('index', {
        title: 'Cloud Resizer',
        resizedImage: outputBase64,
        uploadedImages: uploadedImages
      });
    }
  } catch (error) {
    // In case of errors, render the home page with an error message
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