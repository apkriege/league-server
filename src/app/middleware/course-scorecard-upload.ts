import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

export const SCORECARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const hasExpectedSignature = (file: Express.Multer.File) => {
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
};

const scorecardUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: SCORECARD_IMAGE_MAX_BYTES },
  fileFilter: (_request, file, callback) => {
    if (!acceptedTypes.has(file.mimetype)) {
      callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
      return;
    }
    callback(null, true);
  },
});

export const uploadCourseScorecard = (req: Request, res: Response, next: NextFunction) => {
  scorecardUpload.single('scorecardImage')(req, res, (error) => {
    if (!error && (!req.file || hasExpectedSignature(req.file))) return next();

    const message =
      error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'Scorecard image must be 5 MB or smaller.'
        : 'Scorecard image must be a JPEG, PNG, or WebP file.';
    return res.status(400).json({ message });
  });
};
