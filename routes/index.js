var express = require('express');
const sharp = require('sharp');
const multer = require('multer');
const storage = multer.memoryStorage(); // Store the file in memory
const upload = multer({ storage: storage });
const fs = require('fs').promises;

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  // If session does not have uploadedImages, initialize with default image
  if (!req.session.uploadedImages) {
    req.session.uploadedImages = ['../images/default.jpg'];
  }

  res.render('index', {
    title: 'Express',
    uploadedImages: req.session.uploadedImages,
  });
});


router.post('/resize', upload.single('image'), async function(req, res) {
  try {
    if (req.session.uploadedImages && req.session.uploadedImages[0] === '../images/default.jpg') {
      req.session.uploadedImages.shift();
    }

    // Add the newly saved image to the session
    if (!req.session.uploadedImages) {
      req.session.uploadedImages = [];
    }
    req.session.uploadedImages.push('../images/' + req.file.originalname);

    let imageBuffer = req.file.buffer;
    let width = parseInt(req.body.width);
    let height = parseInt(req.body.height);
    let imageType = req.body.imageType || 'jpeg';  // default to jpeg
    let imageQuality = parseInt(req.body.imageQuality) || 90;  // default quality
    let maintainAspectRatio = req.body.maintainAspectRatio === 'on';  // true if 'on', false otherwise

    let resizeOptions = {
      width: width,
      fit: maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill
    };

    if (height) {
      resizeOptions.height = height;
    }

    let sharpInstance = sharp(imageBuffer).resize(resizeOptions);

    if (imageType === 'jpeg') {
      sharpInstance = sharpInstance.jpeg({ quality: imageQuality });
    } else if (imageType === 'png') {
      sharpInstance = sharpInstance.png();
    } else if (imageType === 'gif') {
      sharpInstance = sharpInstance.gif();
    }

    let outputBuffer = await sharpInstance.toBuffer();

    // Check if the client wants to download the image or not
    let download = req.body.download === 'on';

    if (download) {
      res.setHeader('Content-Disposition', 'attachment; filename=resized-image.' + imageType);
      res.setHeader('Content-Type', req.file.mimetype);
      res.end(outputBuffer);
    } else {
      let outputBase64 = `data:image/${imageType};base64,` + outputBuffer.toString('base64');
      res.render('index', {
        title: 'Cloud Resizer',
        resizedImage: outputBase64,
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


module.exports = router;
