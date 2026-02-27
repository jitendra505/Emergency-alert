const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.memoryStorage(); // Use memory for sharp processing

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 4                    // Max 4 images per report
  }
});

// Process and save uploaded images with sharp (compress + resize)
const processImages = async (files) => {
  const savedPaths = [];

  for (const file of files) {
    const filename = `report_${Date.now()}_${Math.round(Math.random() * 1000)}.webp`;
    const filepath = path.join(uploadsDir, filename);

    await sharp(file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(filepath);

    savedPaths.push(`/uploads/${filename}`);
  }

  return savedPaths;
};

module.exports = { upload, processImages };
