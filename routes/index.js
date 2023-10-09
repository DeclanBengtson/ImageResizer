var express = require('express');
const sharp = require('sharp');  // Image processing library
const multer = require('multer');  // Middleware for handling multipart/form-data (file uploads)
const storage = multer.memoryStorage(); // Configuring multer to store uploaded files in memory
const upload = multer({ storage: storage });  // Initialize multer with memory storage
const fs = require('fs').promises;  // File system promises API for asynchronous file operations

var router = express.Router();  // Create a new router object

/* Endpoint to render the home page */
router.get('/', function(req, res, next) {
  // If the session doesn't have uploaded images, initialize with a default image
  if (!req.session.uploadedImages) {
    req.session.uploadedImages = ['../images/default.jpg'];
  }

  // Render the home page with title and uploaded images
  res.render('index', {
    title: 'Express',
    uploadedImages: req.session.uploadedImages,
  });
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
      // Set headers and send the resized image as a downloadable file
      res.setHeader('Content-Disposition', 'attachment; filename=resized-image.' + imageType);
      res.setHeader('Content-Type', req.file.mimetype);
      res.end(outputBuffer);
    } else {
      // Otherwise, render the page with the resized image (encoded in Base64 format)
      let outputBase64 = `data:image/${imageType};base64,` + outputBuffer.toString('base64');
      res.render('index', {
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
