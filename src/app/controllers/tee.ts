// import { Request, Response } from 'express';
// import CourseTee from '../models/course-tee';

// class CourseTeeController {
//   static getCourseTees = async (req: Request, res: Response) => {
//     try {
//       const courseTees = await CourseTee.findAll();
//       res.status(200).send(courseTees);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };

//   static getCourseTee = async (req: Request, res: Response) => {
//     try {
//       const courseTee = await CourseTee.findById(Number(req.params.id));

//       if (!courseTee) {
//         res.status(404).send('Course tee not found');
//         return;
//       }

//       res.status(200).send(courseTee);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };

//   static createCourseTee = async (req: Request, res: Response) => {
//     try {
//       const courseTee = req.body;
//       const newCourseTee = await CourseTee.create(courseTee);
//       res.status(201).send(newCourseTee);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };

//   static updateCourseTee = async (req: Request, res: Response) => {
//     try {
//       const courseTee = req.body;
//       const updatedCourseTee = await CourseTee.update(Number(req.params.id), courseTee);

//       if (!updatedCourseTee) {
//         res.status(404).send('Course tee not found');
//         return;
//       }

//       res.status(200).send(updatedCourseTee);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };

//   static deleteCourseTee = async (req: Request, res: Response) => {
//     try {
//       await CourseTee.delete(Number(req.params.id));
//       res.status(204).send();
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Internal server error' });
//     }
//   };
// }

// export default CourseTeeController;
