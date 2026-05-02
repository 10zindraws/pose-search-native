import path from 'path';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import os from 'os';
import Database from 'better-sqlite3';
import {getFileSystemRoot} from './get-file-system-root';

dotenv.config();

const app = express();
const port = process.env.PORT || 11419;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/fs/homedir', async (req, res) => {
    res.send(os.homedir());
});

app.get('/fs/root', async (req, res) => {
    res.json(await getFileSystemRoot());
});

app.get('/fs/dir', async (req, res) => {
    const path = req.query.path as string;
    if (!path) {
        res.status(400).send();
        return;
    }
    try {
        const files = await fs.promises.readdir(path, {withFileTypes: true});
        res.json(files.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name));
    } catch (err) {
        res.json([]);
    }
});

app.get('/fs/files', async (req, res) => {
    let path = req.query.path as string;
    if (!path) return res.status(400).send();
    if (!path.endsWith('/')) path += '/';
    
    try {
        const stack:[string, string][] = [[path, '']];
        const ret: string[] =[];
        while (stack.length) {
            const pair = stack.pop();
            if (!pair) break;
            const dir = pair[0];
            const midPath = pair[1];

            let dirents;
            try {
                dirents = await fs.promises.readdir(dir, {withFileTypes: true});
            } catch (err) {
                console.warn(`Skipping directory ${dir} due to access error.`);
                continue;
            }

            for (let dirent of dirents) {
                if (dirent.isDirectory()) {
                    if (dirent.name.startsWith('.')) continue;
                    stack.push([dir + dirent.name + '/', midPath + dirent.name + '/']);
                } else {
                    ret.push(midPath + dirent.name);
                }
            }
        }
        res.json(ret);
    } catch (err) {
        res.status(500).send(err);
    }
});

app.get('/fs/file', async (req, res) => {
    const path = req.query.path as string;
    try {
        const file = await fs.promises.readFile(path);
        const ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        const map: { [name: string]: string } = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'bmp': 'image/bmp',
        };
        res.writeHead(200, {'Content-Type': map[ext] || 'application/octet-stream'});
        res.end(file, 'binary');
    } catch (err) {
        res.status(404).send(err);
    }
});

app.get('/ds/dataset', async (req, res) => {
    try {
        if (!fs.existsSync('./dataset.json')) return res.json({});
        const json = await fs.promises.readFile('./dataset.json');
        res.send(json);
    } catch (e) {
        res.json({});
    }
});

app.post('/ds/dataset', async (req, res) => {
    try {
        await fs.promises.writeFile('./dataset.json', JSON.stringify(req.body));
        res.status(200).end();
    } catch (e) {
        res.status(500).send(e);
    }
});

const dbCache: { [path: string]: Database.Database } = {};

function getDb(folderPath: string) {
    if (dbCache[folderPath]) return dbCache[folderPath];

    const searchDir = path.join(folderPath, '.pose_search');
    if (!fs.existsSync(searchDir)) fs.mkdirSync(searchDir, { recursive: true });
    
    const dbPath = path.join(searchDir, 'data.db');
    const isNew = !fs.existsSync(dbPath);
    const db = new Database(dbPath);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS records (
            filename TEXT PRIMARY KEY,
            width INTEGER,
            height INTEGER,
            landmarks BLOB,
            chest BLOB, face BLOB, upper_arm BLOB, lower_arm BLOB, crotch BLOB, thigh BLOB, calf BLOB, hand BLOB, foot BLOB
        );
        CREATE TABLE IF NOT EXISTS discard (filename TEXT PRIMARY KEY);
    `);

    if (isNew) migrateOldData(folderPath, db);
    
    dbCache[folderPath] = db;
    return db;
}

function migrateOldData(folderPath: string, db: Database.Database) {
    const searchDir = path.join(folderPath, '.pose_search');
    const summaryPath = path.join(searchDir, 'summary.json');
    if (!fs.existsSync(summaryPath)) return;

    try {
        console.log(`Migrating old .dat files to SQLite for: ${folderPath}`);
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
        const discardPath = path.join(searchDir, 'discard.json');
        let discard: string[] =[];
        if (fs.existsSync(discardPath)) discard = JSON.parse(fs.readFileSync(discardPath, 'utf-8'));

        const insertRecord = db.prepare(`INSERT OR IGNORE INTO records (filename, width, height, landmarks, chest, face, upper_arm, lower_arm, crotch, thigh, calf, hand, foot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const insertDiscard = db.prepare(`INSERT OR IGNORE INTO discard (filename) VALUES (?)`);

        db.transaction(() => {
            for (const filename of discard) insertDiscard.run(filename);

            const CHUNK_SIZE = 5000;
            const chunks = Math.ceil(summary.length / CHUNK_SIZE);
            for (let chunkIdx = 0; chunkIdx < chunks; chunkIdx++) {
                const landmarksPath = path.join(searchDir, `landmarks_${chunkIdx}.dat`);
                if (!fs.existsSync(landmarksPath)) continue;
                
                const landmarksBuf = fs.readFileSync(landmarksPath);
                const features: any = {};
                for (const feat of['chest', 'face', 'upper_arm', 'lower_arm', 'crotch', 'thigh', 'calf', 'hand', 'foot']) {
                    const featPath = path.join(searchDir, `${feat}_${chunkIdx}.dat`);
                    if (fs.existsSync(featPath)) features[feat] = fs.readFileSync(featPath);
                }

                for (let j = 0; j < CHUNK_SIZE; j++) {
                    const i = chunkIdx * CHUNK_SIZE + j;
                    if (i >= summary.length) break;
                    const [filename, width, height] = summary[i];
                    
                    const lmStart = j * 33 * 7 * 4;
                    const lm = landmarksBuf.subarray(lmStart, lmStart + 33 * 7 * 4);

                    const getFeat = (name: string, step: number) => {
                        if (!features[name]) return null;
                        const start = j * step * 4;
                        return features[name].subarray(start, start + step * 4);
                    };

                    insertRecord.run(
                        filename, width, height, lm,
                        getFeat('chest', 4), getFeat('face', 4), getFeat('upper_arm', 6),
                        getFeat('lower_arm', 6), getFeat('crotch', 4), getFeat('thigh', 6), getFeat('calf', 6), null, null
                    );
                }
            }
        })();

        fs.unlinkSync(summaryPath);
        if (fs.existsSync(discardPath)) fs.unlinkSync(discardPath);
        for (const file of fs.readdirSync(searchDir)) {
            if (file.endsWith('.dat')) fs.unlinkSync(path.join(searchDir, file));
        }
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

app.get('/ds/records_db', async (req, res) => {
    let folderPath = req.query.path as string;
    if (!folderPath) return res.status(400).end();
    if (!folderPath.endsWith('/')) folderPath += '/';
    
    try {
        const db = getDb(folderPath);
        const records = db.prepare('SELECT * FROM records').all();
        const discard = db.prepare('SELECT filename FROM discard').all().map((r: any) => r.filename);
        
        const formattedRecords = records.map((r: any) => ({
            filename: r.filename, width: r.width, height: r.height,
            landmarks: r.landmarks ? r.landmarks.toString('base64') : null,
            chest: r.chest ? r.chest.toString('base64') : null,
            face: r.face ? r.face.toString('base64') : null,
            upperArm: r.upper_arm ? r.upper_arm.toString('base64') : null,
            lowerArm: r.lower_arm ? r.lower_arm.toString('base64') : null,
            crotch: r.crotch ? r.crotch.toString('base64') : null,
            thigh: r.thigh ? r.thigh.toString('base64') : null,
            calf: r.calf ? r.calf.toString('base64') : null,
            hand: r.hand ? r.hand.toString('base64') : null,
            foot: r.foot ? r.foot.toString('base64') : null,
        }));
        
        res.json({ records: formattedRecords, discard });
    } catch (e) {
        res.status(500).send(String(e));
    }
});

app.post('/ds/records_db', async (req, res) => {
    let folderPath = req.query.path as string;
    if (!folderPath) return res.status(400).end();
    if (!folderPath.endsWith('/')) folderPath += '/';
    
    try {
        const db = getDb(folderPath);
        const { records, discard } = req.body;
        
        const insertRecord = db.prepare(`INSERT OR REPLACE INTO records (filename, width, height, landmarks, chest, face, upper_arm, lower_arm, crotch, thigh, calf, hand, foot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const insertDiscard = db.prepare(`INSERT OR IGNORE INTO discard (filename) VALUES (?)`);
        
        db.transaction(() => {
            if (discard && discard.length) {
                for (const filename of discard) insertDiscard.run(filename);
            }
            if (records && records.length) {
                for (const r of records) {
                    insertRecord.run(
                        r.filename, r.width, r.height,
                        r.landmarks ? Buffer.from(r.landmarks, 'base64') : null,
                        r.chest ? Buffer.from(r.chest, 'base64') : null,
                        r.face ? Buffer.from(r.face, 'base64') : null,
                        r.upperArm ? Buffer.from(r.upperArm, 'base64') : null,
                        r.lowerArm ? Buffer.from(r.lowerArm, 'base64') : null,
                        r.crotch ? Buffer.from(r.crotch, 'base64') : null,
                        r.thigh ? Buffer.from(r.thigh, 'base64') : null,
                        r.calf ? Buffer.from(r.calf, 'base64') : null,
                        r.hand ? Buffer.from(r.hand, 'base64') : null,
                        r.foot ? Buffer.from(r.foot, 'base64') : null
                    );
                }
            }
        })();
        
        res.status(200).end();
    } catch (e) {
        res.status(500).send(String(e));
    }
});

app.post('/ds/clear_discard', async (req, res) => {
    let folderPath = req.query.path as string;
    if (!folderPath) return res.status(400).end();
    if (!folderPath.endsWith('/')) folderPath += '/';
    
    try {
        const db = getDb(folderPath);
        db.prepare('DELETE FROM discard').run();
        res.status(200).end();
    } catch (e) {
        res.status(500).send(String(e));
    }
});

app.listen(port, async () => {
    if (process.env.NODE_ENV === 'development') return;
    console.log(`[server]: Server is running at http://localhost:${port}`);
});