"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TempController {
    static getTemp = async (req, res) => {
        try {
            res.status(200).send('Hello, TypeScript with Express!');
        }
        catch (error) {
            console.error(error);
            res.status(500).send(error);
        }
    };
}
exports.default = TempController;
