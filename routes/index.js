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

/* Endpoint to render the home page */
router.get('/', async function(req, res, next) {
  try {
    // If the session doesn't have uploaded images, initialize with a default image
    if (!req.session.uploadedImages) {
      req.session.uploadedImages = ['../images/default.jpg'];
    }

    const uploadedImages = req.session.uploadedImages;

    // Check if the uploaded images are in Redis
    const redisImages = await Promise.all(
      uploadedImages.map(async (imagePath) => {
        const cacheKey = `resize-${imagePath}`;
        const redisImage = await client.get(cacheKey);
        return { imagePath, redisImage };
      })
    );

    // Check if the uploaded images are in S3
    const s3Images = await Promise.all(
      uploadedImages.map(async (imagePath) => {
        const key = `resized-images/${path.basename(imagePath)}`;
        try {
          const s3Object = await s3.getObject({ Bucket: bucketName, Key: key }).promise();
          return { imagePath, s3Image: s3Object.Body };
        } catch (err) {
          // Ignore errors if the image is not found in S3
          return null;
        }
      })
    );

    // Render the home page with title and uploaded images
    res.render('index', {
      title: 'Cloud Resizer',
      uploadedImages,
      redisImages,
      s3Images,
    });
  } catch (error) {
    // Handle errors as needed
    console.error(error);
    res.render('index', {
      title: 'Cloud Resizer',
      error: error.message,
    });
  }
});

/* Endpoint to resize the uploaded image */
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
    req.session.uploadedImages.push('../images/' + req.file.originalname);

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

    // Check if the client wants the image as a download
    let download = req.body.download === 'on';

    if (download) {
      let cacheKey = `${req.body.width}-${req.body.height}-${req.file.originalname}`;

      let params = {
        Bucket: bucketName,
        Key: 'resized-images/' + req.file.originalname,
        Body: outputBuffer,
        ContentType: 'image/' + imageType
      };
      //check if image is in redis if not check if it is in s3 if not in both upload to
      const result = await client.get(cacheKey);
      if (result) {
        console.log(`Found in Redis Cache`);
        // server from Redis cache
        res.setHeader('Content-Disposition', 'attachment; filename=resized-image.' + imageType);
        res.setHeader('Content-Type', req.file.mimetype);
        return res.end(outputBuffer);
        // not found in Redis Cache
      }
      else{
      // check AWS store
      return new AWS.S3().getObject(params, (err, result) => {
        if (result) {
          console.log(`Found in S3`);
          // upload to redis cache
          redisClient.setEx(redisKey, 3600, outputBuffer.toString('base64'));
          console.log(`Stored in Redis cache`);
          res.setHeader('Content-Disposition', 'attachment; filename=resized-image.' + imageType);
          res.setHeader('Content-Type', req.file.mimetype);
          return res.end(outputBuffer);
          // not found in S3 so save to redis and S3
        } else {
          console.log("Uploaded to S3 and redis");
          let uploadResult = s3.upload(params).promise();
          client.setEx(cacheKey, 3600, outputBuffer.toString('base64'));
          // Set headers and send the resized image as a downloadable file
          res.setHeader('Content-Disposition', 'attachment; filename=resized-image.' + imageType);
          res.setHeader('Content-Type', req.file.mimetype);
          return res.end(outputBuffer);
        }
        
      })
    }
    } else {
      // Otherwise, render the page with the resized image (encoded in Base64 format)
      let outputBase64 = `data:image/${imageType};base64,` + outputBuffer.toString('base64');
      return res.render('index', {
        title: 'Cloud Resizer',
        resizedImage: outputBase64,
        uploadedImages: req.session.uploadedImages
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

// Export the router module to be used in other parts of the application
module.exports = router;
