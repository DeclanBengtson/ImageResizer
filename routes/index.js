const express = require('express');
const sharp = require('sharp');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).array('image', 10); // Adjust '10' to the max number of files you want to allow
const fs = require('fs').promises;
const AWS = require('aws-sdk');
const redis = require('redis');
const os = require('os');
const router = express.Router();
const archiver = require('archiver');

require('dotenv').config();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "ap-southeast-2",
});

const bucketName = 'n11079550bucket';
const s3 = new AWS.S3({ apiVersion: "2006-03-01" });

// Function to create the S3 bucket if it doesn't exist
async function createBucket() {
  try {
    await s3.createBucket({ Bucket: bucketName }).promise();
    console.log(`Created bucket: ${bucketName}`);
  } catch (err) {
    // Handle errors, and ignore if the bucket already exists (status code 409)
    if (err.statusCode !== 409) {
      console.error(`Error creating bucket: ${err}`);
    }
  }
}

// Ensure the S3 bucket is created
createBucket();

const client = redis.createClient();
(async () => {
  try {
    await client.connect();
  } catch (err) {
    console.log(err);
  }
})();

// Store uploaded file names and images
const uploadedFileNames = [];
const uploadedImages = [];
const cacheKeysArray = [];

function getFirstMacAddress() {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName of Object.keys(networkInterfaces)) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  throw new Error('No non-internal MAC address found.');
}

router.get('/', function (req, res, next) {
  if (!req.session.uploadedImages) {
    req.session.uploadedImages = ['../images/default.jpg'];
  }
  res.render('index', {
    title: 'Express',
    uploadedImages: req.session.uploadedImages,
  });
});

router.post('/resize', upload, async function (req, res) {
  try {
    if (req.session.uploadedImages && req.session.uploadedImages[0] === '../images/default.jpg') {
      req.session.uploadedImages.shift();
    }

    if (!req.session.uploadedImages) {
      req.session.uploadedImages = [];
    }

    let buffers = [];
    let imagesProcessed = [];
    const macAddress = getFirstMacAddress();

    for (const file of req.files) {
      let width = parseInt(req.body.width);
      let height = parseInt(req.body.height);
      let imageType = req.body.imageType || 'jpeg';
      let imageQuality = parseInt(req.body.imageQuality) || 90;
      let maintainAspectRatio = req.body.maintainAspectRatio === 'on';

      let resizeOptions = {
        width: width,
        fit: maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill
      };
      if (height) resizeOptions.height = height;

      let sharpInstance = sharp(file.buffer).resize(resizeOptions);
      if (imageType === 'jpeg') sharpInstance = sharpInstance.jpeg({ quality: imageQuality });
      if (imageType === 'png') sharpInstance = sharpInstance.png();
      if (imageType === 'gif') sharpInstance = sharpInstance.gif();

      let outputBuffer = await sharpInstance.toBuffer();
      buffers.push({ buffer: outputBuffer, type: imageType, name: file.originalname }); // Store the buffer along with the image type and name

      let cacheKey = `${macAddress}-${width}-${height}-${file.originalname}`;
      cacheKeysArray.push(cacheKey);

      const result = await client.get(cacheKey);
      if (result) {
        console.log(`Found in Redis Cache`);
        imagesProcessed.push(`data:image/${imageType};base64,${result}`);
      } else {
        let uploadParams = {
          Bucket: bucketName,
          Key: `resized-images/${macAddress}-${width}-${height}-${file.originalname}`,
          ContentType: 'image/' + imageType,
          Body: outputBuffer,
        };

        let uploadResult = await s3.upload(uploadParams).promise();
        console.log(`Uploaded to S3`);

        uploadedFileNames.push(file.originalname);

        const base64Image = outputBuffer.toString('base64');
        await client.setEx(cacheKey, 3600, base64Image);
        console.log(`Stored in Redis cache`);
        imagesProcessed.push(`data:image/${imageType};base64,${base64Image}`);
      }
    }

    req.session.uploadedImages.push(...imagesProcessed);

    let download = req.body.download === 'on';
    if (download) {
      if (buffers.length === 1) {
        // Single file download
        let file = buffers[0];
        res.setHeader('Content-Disposition', 'attachment; filename=resized-' + file.name);
        res.setHeader('Content-Type', 'image/' + file.type);
        res.end(file.buffer);
      } else {
        // Multiple file download
        let archive = archiver('zip', { zlib: { level: 9 } }); // Sets the compression level.
        res.setHeader('Content-Disposition', 'attachment; filename="resized-images.zip"');
        res.setHeader('Content-Type', 'application/zip');
        archive.pipe(res);

        buffers.forEach(file => {
          archive.append(file.buffer, { name: 'resized-' + file.name });
        });

        archive.finalize().catch(err => {
          console.error('Archiving failed', err);
          res.status(500).send('Error in downloading files');
        });

        return; // Ensure that the rest of the function doesn't execute
      }
    } else {
      res.render('index', {
        title: 'Cloud Resizer',
        resizedImage: imagesProcessed[0], // This will only show the first image, adjust as needed
        uploadedImages: req.session.uploadedImages
      });
    }
  } catch (error) {
    res.render('index', {
      title: 'Cloud Resizer',
      error: error.message
    });
  }
});

const { promisify } = require('util');
const redisGetAsync = promisify(client.get).bind(client);

router.get('/download/:index', async function (req, res) {
  try {
    const index = parseInt(req.params.index);

    if (index >= 0 && index < uploadedFileNames.length) {
      const fileName = uploadedFileNames[index];
      const cacheKey = cacheKeysArray[index];

      const imageFromRedis = await client.get(cacheKey);

      if (imageFromRedis) {
        res.setHeader('Content-Disposition', `attachment; filename=resized-image-${fileName}`);
        res.setHeader('Content-Type', 'image/jpeg');
        res.end(Buffer.from(imageFromRedis, 'base64'));
      } else {
        const imageFromS3Key = `resized-images/${cacheKey}`;
        s3.getObject({ Bucket: bucketName, Key: imageFromS3Key }, (err, data) => {
          if (data) {
            const imageBuffer = data.Body;
            client.setEx(cacheKey, 3600, imageBuffer.toString('base64'));
            res.setHeader('Content-Disposition', `attachment; filename=${imageFromS3Key}`);
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
