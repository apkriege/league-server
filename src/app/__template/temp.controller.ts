import { Request, Response } from 'express';
import Temp from './temp.model';

class TempController {
  static getTemp = async (req: Request, res: Response) => {
    try {
      res.status(200).send('Hello, TypeScript with Express!');
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  };
}

export default TempController;
