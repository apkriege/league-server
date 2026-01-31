import { Request, Response } from 'express';
import ClubService from '../services/club';
import { relationBuilder } from '../utils/relation-builder';

class ClubController {
  static getClub = async (req: Request, res: Response) => {
    try {
      const query = req.query;
      const id = parseInt(req.params.id);

      const club = await ClubService.findById(id);

      if (!club) {
        res.status(404).send('Club not found');
        return;
      }

      res.status(200).send(club);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static getClubs = async (req: Request, res: Response) => {
    try {
      const clubs = await ClubService.findAll();

      res.status(200).send(clubs);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static createClub = async (req: Request, res: Response) => {
    try {
      const club = req.body;
      const newClub = await ClubService.create(club);
      res.status(201).send(newClub);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  static updateClub = async (req: Request, res: Response) => {
    try {
      const club = req.body;
      const updatedClub = await ClubService.update(Number(req.params.id), club);

      if (!updatedClub) {
        res.status(404).send('Club not found');
        return;
      }

      res.status(200).send(updatedClub);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // static deleteClub = async (req: Request, res: Response) => {
  //   try {
  //     const club = await Club.delete(Number(req.params.id));

  //     if (!club) {
  //       res.status(404).send('Club not found');
  //       return;
  //     }

  //     res.status(200).send(club);
  //   } catch (error) {
  //     console.error(error);
  //     res.status(500).json({ message: 'Internal server error' });
  //   }
  // };
}

export default ClubController;
