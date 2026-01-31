import express from 'express';
import TempController from './temp.controller';
const router = express.Router();

router.get('/', TempController.getTemp);

export default router;
