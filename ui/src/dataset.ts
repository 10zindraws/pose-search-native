import {reactive} from 'vue';
import {featureBuffers} from './search/feature/feature-buffers';
import PhotoPoseLandmarks, {NUM_OF_LANDMARKS} from './utils/PhotoPoseLandmarks';
import {request} from './utils/request';

export const DATASET_CHUNK_SIZE = 5000;

// ─── Gender category types ────────────────────────────────────────────────────

export type GenderCategory = 'Female' | 'Male';
export type GenderFilter = 'Female' | 'Male' | 'Both';

export type AttireCategory = 'Nude/Undies' | 'Clothed';
export type AttireFilter = 'Nude/Undies' | 'Clothed' | 'Both';

// ─── DatasetFolder (unchanged internal structure) ────────────────────────────

export class DatasetFolder {
    path: string = '';
    records: PhotoPoseLandmarks[] = [];
    features: {[name: string]: Float32Array }[] =[];
    recordsLoaded: boolean = false;
    landmarksLoaded: boolean = false;
    discard?: string[];
    disabled?: boolean;
}

// ─── Dataset JSON shape ──────────────────────────────────────────────────────

type DatasetJson =
    | {
    folders: { Female?: string[]; Male?: string[] },
    attireFolders?: { 'Nude/Undies'?: string[]; Clothed?: string[] },
    disabledFolders?: string[]
}
    | { folders: string[] };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

// ─── Reactive dataset store ──────────────────────────────────────────────────

const dataset = reactive({
    /** All registered folders, regardless of gender. */
    folders: [] as DatasetFolder[],

    genderFolders: {
        Female: [] as string[],
        Male: [] as string[],
    } as Record<GenderCategory, string[]>,

    attireFolders: {
        'Nude/Undies':[] as string[],
        'Clothed': [] as string[],
    } as Record<AttireCategory, string[]>,

    promise: null as Promise<any> | null,

    // ── Persistence ──────────────────────────────────────────────────────────

    /** Serialise current state to dataset.json via the server. */
    async save() {
        const disabledFolders = this.folders
            .filter(f => f.disabled)
            .map(f => f.path);
        await request('/ds/dataset', {
            method: 'post',
            body: JSON.stringify({
                folders: {
                    Female: this.genderFolders.Female,
                    Male: this.genderFolders.Male,
                },
                attireFolders: {
                    'Nude/Undies': this.attireFolders['Nude/Undies'],
                    'Clothed': this.attireFolders.Clothed,
                },
                disabledFolders: disabledFolders
            }),
            headers: {'Content-Type': 'application/json'}
        });
    },

    /** Load dataset.json from the server and rebuild internal state. */
    async load() {
        if (this.promise) {
            return this.promise;
        }
        const res = await (this.promise = request('/ds/dataset'));
        const json: DatasetJson = await res.json();

        if (!json?.folders) {
            return;
        }

        if (Array.isArray(json.folders)) {
            this.genderFolders.Female = json.folders as string[];
            this.genderFolders.Male =[];
            this.attireFolders['Nude/Undies'] = json.folders as string[];
            this.attireFolders.Clothed =[];
        } else {
            this.genderFolders.Female = (json.folders as any).Female ??[];
            this.genderFolders.Male = (json.folders as any).Male ??[];
            this.attireFolders['Nude/Undies'] = (json as any).attireFolders?.['Nude/Undies'] ??[];
            this.attireFolders.Clothed = (json as any).attireFolders?.Clothed ??[];

            // For backward compatibility, if attireFolders is missing, populate it with all paths as Nude/Undies
            if (!(json as any).attireFolders) {
                this.attireFolders['Nude/Undies'] =[
                    ...this.genderFolders.Female,
                    ...this.genderFolders.Male
                ];
            }
        }

        this._rebuildFolders();

        if ('disabledFolders' in json && Array.isArray(json.disabledFolders)) {
            const disabledSet = new Set(json.disabledFolders);
            this.folders.forEach(folder => {
                if (disabledSet.has(folder.path)) {
                    folder.disabled = true;
                }
            });
        }
    },

    _rebuildFolders() {
        const allPaths = new Set([
            ...this.genderFolders.Female,
            ...this.genderFolders.Male,
            ...this.attireFolders['Nude/Undies'],
            ...this.attireFolders.Clothed,
        ]);

        const existing = new Map(this.folders.map(f =>[f.path, f]));

        this.folders = Array.from(allPaths).map(path => {
            if (!path.endsWith('/')) path += '/';
            const found = existing.get(path);
            if (found) return found;
            const folder = new DatasetFolder();
            folder.path = path;
            return folder;
        });
    },

    // ── Gender & Attire helpers ────────────────────────────────────────────────────────

    getGenderForPath(path: string): GenderCategory | null {
        if (!path.endsWith('/')) path += '/';
        if (this.genderFolders.Female.includes(path)) return 'Female';
        if (this.genderFolders.Male.includes(path)) return 'Male';
        return null;
    },

    getAttireForPath(path: string): AttireCategory | null {
        if (!path.endsWith('/')) path += '/';
        if (this.attireFolders['Nude/Undies'].includes(path)) return 'Nude/Undies';
        if (this.attireFolders.Clothed.includes(path)) return 'Clothed';
        return null;
    },

    getPathsForFilter(genderFilter: GenderFilter, attireFilter: AttireFilter): string[] {
        let genderPaths = genderFilter === 'Both'
            ?[...this.genderFolders.Female, ...this.genderFolders.Male]
            :[...this.genderFolders[genderFilter]];

        let attirePaths = attireFilter === 'Both'
            ? [...this.attireFolders['Nude/Undies'], ...this.attireFolders.Clothed]
            : [...this.attireFolders[attireFilter]];

        const attireSet = new Set(attirePaths);
        const combinedPaths = genderPaths.filter(p => attireSet.has(p));

        const disabledSet = new Set(this.folders.filter(f => f.disabled).map(f => f.path));
        return combinedPaths.filter(p => !disabledSet.has(p));
    },

    assignGender(path: string, gender: GenderCategory) {
        if (!path.endsWith('/')) path += '/';
        const other: GenderCategory = gender === 'Female' ? 'Male' : 'Female';
        this.genderFolders[other] = this.genderFolders[other].filter(p => p !== path);
        if (!this.genderFolders[gender].includes(path)) {
            this.genderFolders[gender].push(path);
        }
        this._rebuildFolders();
    },

    assignAttire(path: string, attire: AttireCategory) {
        if (!path.endsWith('/')) path += '/';
        const other: AttireCategory = attire === 'Nude/Undies' ? 'Clothed' : 'Nude/Undies';
        this.attireFolders[other] = this.attireFolders[other].filter(p => p !== path);
        if (!this.attireFolders[attire].includes(path)) {
            this.attireFolders[attire].push(path);
        }
        this._rebuildFolders();
    },

    // ── Folder accessors (unchanged API) ─────────────────────────────────────

    getFolder(path: string) {
        if (!path.endsWith('/')) {
            path += '/';
        }
        let folder = this.folders.find(folder => folder.path === path);
        if (!folder) {
            folder = new DatasetFolder();
            folder.path = path;
            this.folders.push(folder);
        }
        return folder;
    },

    // ── Record I/O (unchanged) ────────────────────────────────────────────────

    async saveFolderRecords(path: string) {
        const folder = this.getFolder(path);
        if (!folder.landmarksLoaded) {
            await this.loadFolderLandmarks(path);
        }
        
        const unsavedRecords = folder.records.filter(r => !r.saved);
        if (unsavedRecords.length === 0 && (!folder.discard || folder.discard.length === 0)) {
            return;
        }

        const discardToSend = [...(folder.discard || [])];
        folder.discard =[];

        const CHUNK_SIZE = 1000;
        const DISCARD_CHUNK_SIZE = 10000;
        
        try {
            let recordIndex = 0;
            let discardIndex = 0;
            
            while (recordIndex < unsavedRecords.length || discardIndex < discardToSend.length) {
                const recordChunk = unsavedRecords.slice(recordIndex, recordIndex + CHUNK_SIZE);
                const discardChunk = discardToSend.slice(discardIndex, discardIndex + DISCARD_CHUNK_SIZE);
                
                recordIndex += CHUNK_SIZE;
                discardIndex += DISCARD_CHUNK_SIZE;
                
                const recordsPayload = recordChunk.map(record => {
                    record.saved = true;
                    const landmarks = new Float32Array(NUM_OF_LANDMARKS * 7);
                    for (let j = 0; j < NUM_OF_LANDMARKS; ++j) {
                        const offset = j * 7;
                        landmarks[offset] = record.normalized[j][0];
                        landmarks[offset + 1] = record.normalized[j][1];
                        landmarks[offset + 2] = record.normalized[j][2];
                        landmarks[offset + 3] = record.world[j][0];
                        landmarks[offset + 4] = record.world[j][1];
                        landmarks[offset + 5] = record.world[j][2];
                        landmarks[offset + 6] = record.visibility[j];
                    }
                    
                    const features: any = {};
                    for (let name in featureBuffers) {
                        const featureBuffer = featureBuffers[name as keyof typeof featureBuffers];
                        features[name] = arrayBufferToBase64(featureBuffer.create([record]).buffer);
                    }

                    return {
                        filename: record.filename,
                        width: record.width,
                        height: record.height,
                        landmarks: arrayBufferToBase64(landmarks.buffer),
                        ...features
                    };
                });

                const payload = {
                    records: recordsPayload,
                    discard: discardChunk
                };

                const res = await request('/ds/records_db?path=' + encodeURIComponent(folder.path), {
                    method: 'post',
                    body: JSON.stringify(payload),
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!res.ok) {
                    throw new Error(`Server returned ${res.status} ${res.statusText}`);
                }
            }
        } catch (e) {
            unsavedRecords.forEach(r => r.saved = false);
            folder.discard.push(...discardToSend);
            throw e;
        }
    },

    async loadFolderRecords(path: string) {
        const folder = this.getFolder(path);
        if (folder.recordsLoaded) {
            return;
        }
        
        const res = await request(`/ds/records_db?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            throw new Error(`Failed to load records: Server returned ${res.status} ${res.statusText}`);
        }
        
        const json = await res.json();
        folder.records = [];
        folder.features =[];
        
        const featuresMap: { [name: string]: Float32Array[] } = {};
        for (let name in featureBuffers) {
            featuresMap[name] =[];
        }

        let needsSave = false;
        for (let i = 0; i < json.records.length; i++) {
            const r = json.records[i];
            const record = new PhotoPoseLandmarks();
            record.filename = r.filename;
            record.width = r.width;
            record.height = r.height;
            record.saved = true;
            
            if (r.landmarks) {
                const lmBuf = new Float32Array(base64ToArrayBuffer(r.landmarks));
                for (let j = 0; j < NUM_OF_LANDMARKS; ++j) {
                    const offset = j * 7;
                    record.normalized.push([lmBuf[offset], lmBuf[offset + 1], lmBuf[offset + 2]]);
                    record.world.push([lmBuf[offset + 3], lmBuf[offset + 4], lmBuf[offset + 5]]);
                    record.visibility.push(lmBuf[offset + 6]);
                }
            }

            let missingFeature = false;
            for (let name in featureBuffers) {
                if (!r[name]) {
                    missingFeature = true;
                    break;
                }
            }

            if (missingFeature) {
                record.saved = false;
                needsSave = true;
                for (let name in featureBuffers) {
                    if (!r[name]) {
                        const featureBuffer = featureBuffers[name as keyof typeof featureBuffers];
                        const featBuf = featureBuffer.create([record]);
                        r[name] = arrayBufferToBase64(featBuf.buffer);
                    }
                }
            }

            folder.records.push(record);
            
            const chunkIdx = Math.floor(i / DATASET_CHUNK_SIZE);
            if (!folder.features[chunkIdx]) {
                folder.features[chunkIdx] = {};
            }
            
            for (let name in featureBuffers) {
                let featBuf: Float32Array;
                if (r[name]) {
                    featBuf = new Float32Array(base64ToArrayBuffer(r[name]));
                } else {
                    const featureBuffer = featureBuffers[name as keyof typeof featureBuffers];
                    if (record.normalized.length === NUM_OF_LANDMARKS) {
                        featBuf = featureBuffer.create([record]);
                    } else {
                        const dummy = new PhotoPoseLandmarks();
                        dummy.normalized = new Array(NUM_OF_LANDMARKS).fill([0,0,0]);
                        dummy.world = new Array(NUM_OF_LANDMARKS).fill([0,0,0]);
                        dummy.visibility = new Array(NUM_OF_LANDMARKS).fill(0);
                        featBuf = featureBuffer.create([dummy]);
                    }
                    record.saved = false;
                }
                if (!featuresMap[name][chunkIdx]) {
                    const remaining = Math.min(DATASET_CHUNK_SIZE, json.records.length - chunkIdx * DATASET_CHUNK_SIZE);
                    featuresMap[name][chunkIdx] = new Float32Array(remaining * featBuf.length);
                    folder.features[chunkIdx][name] = featuresMap[name][chunkIdx];
                }
                const localIdx = i % DATASET_CHUNK_SIZE;
                featuresMap[name][chunkIdx].set(featBuf, localIdx * featBuf.length);
            }
        }
        
        folder.discard = json.discard ||[];
        folder.recordsLoaded = true;
        folder.landmarksLoaded = true;

        if (needsSave) {
            this.saveFolderRecords(path);
        }
    },

    async loadFolderLandmarks(path: string) {
        await this.loadFolderRecords(path);
    }
});

export function useDataset() {
    return dataset;
}