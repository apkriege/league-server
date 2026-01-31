// import { Request, Response } from 'express';
// import EventMatches from '../models/event-flights';

// class EventMatchesController {
//   static getEventMatches = async (req: Request, res: Response) => {
//     try {
//       const eventMatches = await EventMatches.findAll();
//       res.status(200).send(eventMatches);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };

//   static getEventMatch = async (req: Request, res: Response) => {
//     try {
//       const eventMatch = await EventMatches.findById(Number(req.params.id));

//       if (!eventMatch) {
//         res.status(404).send('Event match not found');
//         return;
//       }

//       res.status(200).send(eventMatch);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };

//   static createEventMatch = async (req: Request, res: Response) => {
//     try {
//       const eventMatch = req.body;
//       const newEventMatch = await EventMatches.create(eventMatch);
//       res.status(201).send(newEventMatch);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };

//   static updateEventMatch = async (req: Request, res: Response) => {
//     try {
//       const eventMatch = req.body;
//       const updatedEventMatch = await EventMatches.update(Number(req.params.id), eventMatch);

//       if (!updatedEventMatch) {
//         res.status(404).send('Event match not found');
//         return;
//       }

//       res.status(200).send(updatedEventMatch);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };

//   static deleteEventMatch = async (req: Request, res: Response) => {
//     try {
//       await EventMatches.delete(Number(req.params.id));
//       res.status(200).send('Event match deleted');
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };
// }

// export default EventMatchesController;
