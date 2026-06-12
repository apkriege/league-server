"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Handicap } = require('../services/handicap');
class TestController {
    static fullHandicapTest = async (req, res) => {
        try {
            const { playerId } = req.body;
            console.log('Starting full handicap test for playerId:', playerId);
            const hcp = new Handicap(playerId);
            await hcp.runFullPlayerHandicap();
            return res.status(200).json({ message: 'Handicap test completed successfully' });
        }
        catch (error) {
            console.error('Error in fullHandicapTest:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
}
exports.default = TestController;
