"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const club_1 = __importDefault(require("../models/club"));
class ClubController {
    static getClub = async (req, res) => {
        try {
            const query = req.query;
            const id = Number(req.params.id);
            const club = await club_1.default.findById(id);
            if (!club) {
                res.status(404).send('Club not found');
                return;
            }
            res.status(200).send(club);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
    static getClubs = async (req, res) => {
        try {
            const clubs = await club_1.default.findAll();
            res.status(200).send(clubs);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
    static createClub = async (req, res) => {
        try {
            const club = req.body;
            const newClub = await club_1.default.create(club);
            res.status(201).send(newClub);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
    static updateClub = async (req, res) => {
        try {
            const club = req.body;
            const updatedClub = await club_1.default.update(Number(req.params.id), club);
            if (!updatedClub) {
                res.status(404).send('Club not found');
                return;
            }
            res.status(200).send(updatedClub);
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}
exports.default = ClubController;
