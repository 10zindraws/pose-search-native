import {computed, defineComponent, onBeforeUnmount, PropType, ref, watch} from 'vue';
import NormalizedLandmarksCanvas from '../components/NormalizedLandmarksCanvas/NormalizedLandmarksCanvas.vue';
import PopupDialog from '../components/popup/PopupDialog/PopupDialog.vue';
import {useDataset} from '../dataset';
import {loadImage} from '../utils/image';
import PhotoPoseLandmarks, {NUM_OF_LANDMARKS} from '../utils/PhotoPoseLandmarks';
import {BASE_PATH, request} from '../utils/request';
import {showAlertDialog} from './dialogs';

type DetectPoseResults = {
    normalizedLandmarks: { point:[number, number, number], visibility: number }[];
    worldLandmarks: { point:[number, number, number], visibility: number }[];
};

/*
 * Analysis of the ~3200 images scan limit issue:
 * 
 * The issue where scanning stops at around 3200 images is NOT caused by the size of the SQLite database 
 * (`data.db`) or the number of images in a single directory. SQLite can easily handle millions of rows, 
 * and the payload size for 3200 records is only a few megabytes, well within the 50MB limit.
 * 
 * The actual root cause is a memory leak in the MediaPipe WebAssembly worker (`detect-pose.worker.js`). 
 * When a worker processes too many images (around 800 images per worker), it runs out of memory (OOM) 
 * and silently crashes without throwing an error. With 4 concurrent workers, this happens at exactly 
 * ~3200 images (4 * 800 = 3200). When all workers silently crash, the `WorkerPool` queue hangs forever, 
 * causing the scan to stop progressing.
 * 
 * Therefore, distributing `.pose_search` folders into subdirectories (as suggested) would NOT fix the 
 * issue for large flat directories and would introduce unnecessary complexity and backward compatibility 
 * issues.
 * 
 * The correct and robust solution is to:
 * 1. Proactively terminate and restart each worker after processing a certain number of images (e.g., 200) 
 *    to prevent the OOM crash.
 * 2. Add timeouts to `loadImage`, `createImageBitmap`, and the worker execution to ensure that if a 
 *    worker or image load hangs for any reason, the task is rejected and the queue continues to progress.
 */

class WorkerPool {
    workers: Worker[] =[];
    idle: Worker[] =[];
    queue: { image: HTMLImageElement, resolve: Function, reject: Function }[] =[];
    workerTaskCount: Map<Worker, number> = new Map();

    constructor(size: number) {
        for (let i = 0; i < size; i++) {
            this.addWorker();
        }
    }

    addWorker() {
        const w = new Worker('/assets/detect-pose.worker.js', {type: 'classic'});
        this.workers.push(w);
        this.idle.push(w);
        this.workerTaskCount.set(w, 0);
    }

    async detect(image: HTMLImageElement): Promise<DetectPoseResults> {
        return new Promise((resolve, reject) => {
            this.queue.push({ image, resolve, reject });
            this.pump();
        });
    }

    async pump() {
        if (this.queue.length === 0 || this.idle.length === 0) return;
        const task = this.queue.shift()!;
        const worker = this.idle.shift()!;

        try {
            const MAX_SIZE = 1000;
            let bitmap: ImageBitmap;
            
            const createBitmap = async () => {
                if (task.image.width > MAX_SIZE || task.image.height > MAX_SIZE) {
                    const scale = MAX_SIZE / Math.max(task.image.width, task.image.height);
                    const width = Math.floor(task.image.width * scale);
                    const height = Math.floor(task.image.height * scale);
                    
                    try {
                        return await createImageBitmap(task.image, { resizeWidth: width, resizeHeight: height, resizeQuality: 'low' });
                    } catch (e) {
                        let canvas: HTMLCanvasElement | OffscreenCanvas;
                        if (typeof OffscreenCanvas !== 'undefined') {
                            canvas = new OffscreenCanvas(width, height);
                        } else {
                            canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                        }
                        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
                        ctx.drawImage(task.image, 0, 0, width, height);
                        return await createImageBitmap(canvas);
                    }
                } else {
                    return await createImageBitmap(task.image);
                }
            };

            bitmap = await Promise.race([
                createBitmap(),
                new Promise<ImageBitmap>((_, reject) => setTimeout(() => reject(new Error('createImageBitmap timeout')), 15000))
            ]);

            let timeoutId = setTimeout(() => {
                worker.terminate();
                const index = this.workers.indexOf(worker);
                if (index !== -1) this.workers.splice(index, 1);
                this.workerTaskCount.delete(worker);
                this.addWorker();
                this.pump();
                task.reject(new Error('Worker timeout'));
            }, 15000);

            worker.onmessage = (e) => {
                clearTimeout(timeoutId);
                let count = this.workerTaskCount.get(worker) || 0;
                count++;
                if (count >= 200) {
                    worker.terminate();
                    const index = this.workers.indexOf(worker);
                    if (index !== -1) this.workers.splice(index, 1);
                    this.workerTaskCount.delete(worker);
                    this.addWorker();
                } else {
                    this.workerTaskCount.set(worker, count);
                    this.idle.push(worker);
                }
                this.pump();
                if (e.data) task.resolve(e.data);
                else task.reject(new Error('Failed to run model'));
            };
            worker.onerror = (err) => {
                clearTimeout(timeoutId);
                worker.terminate();
                const index = this.workers.indexOf(worker);
                if (index !== -1) this.workers.splice(index, 1);
                this.workerTaskCount.delete(worker);
                this.addWorker();
                this.pump();
                task.reject(err);
            };
            
            worker.postMessage(bitmap,[bitmap]);
        } catch (err) {
            this.idle.push(worker);
            this.pump();
            task.reject(err);
        }
    }

    terminate() {
        this.workers.forEach(w => w.terminate());
        this.workers =[];
        this.idle =[];
        this.workerTaskCount.clear();
    }
}

export default defineComponent({
    components: {PopupDialog, NormalizedLandmarksCanvas},
    props: {
        paths: Array as PropType<string[]>,
        visible: Boolean,
    },
    emits: ['update:visible'],
    setup(props, ctx) {
        const dataset = useDataset();
        const total = ref(0);
        const progress = ref(0);
        const percent = computed(function () {
            return Math.round(progress.value / total.value * 100);
        });
        const progressText = computed(function () {
            return `${progress.value} / ${total.value}`;
        });
        const currFile = ref('');
        const prevImgUrl = ref('');
        const landmarks = ref<{ point:[number, number, number], visibility: number }[]>([]);
        const currImgUrl = ref('');
        const remainingSecs = ref(0);
        const remaining = computed(function () {
            function padZero(val: number) {
                return val < 10 ? '0' + val : val + '';
            }

            let dt = Math.round(remainingSecs.value);
            const secs = dt % 60;
            dt = Math.floor(dt / 60);
            const mins = dt % 60;
            dt = Math.floor(dt / 60);
            const hours = dt;
            return `${padZero(hours)}:${padZero(mins)}:${padZero(secs)}`;
        });
        const stop = ref(false);
        const SAVE_EVERY_N = 10;
        
        let pool: WorkerPool | null = null;

        watch(() => props.visible, function (visible) {
            if (!visible || !props.paths?.length) {
                return;
            }
            start();
        });

        function isImage(fileName: string) {
            fileName = fileName.toLowerCase();
            const ext = fileName.substring(fileName.lastIndexOf('.') + 1);
            return['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'apng', 'gif', 'avif', 'webp', 'bmp'].includes(ext);
        }

        let tid: number = 0;

        function startCountdown() {
            if (!tid) {
                tid = window.setInterval(function () {
                    remainingSecs.value = Math.max(0, remainingSecs.value - 1);
                }, 1000);
            }
        }

        function stopCountdown() {
            if (tid) {
                clearInterval(tid);
                tid = 0;
            }
        }

        onBeforeUnmount(function () {
            stopCountdown();
            if (pool) {
                pool.terminate();
                pool = null;
            }
        });

        async function start() {
            try {
                total.value = 0;
                progress.value = 0;
                remainingSecs.value = 0;
                stop.value = false;
                currFile.value = '';
                currImgUrl.value = '';
                prevImgUrl.value = '';
                landmarks.value = [];
                const jobs: { folder: string, images: string[] }[] =[];
                for (let path of props.paths!) {
                    const res = await request('/fs/files?path=' + path);
                    const json: string[] = await res.json();
                    const folder = dataset.getFolder(path);
                    const existed = new Set(folder.records.map(record => record.filename));
                    if (folder.discard) {
                        for (let filename of folder.discard) {
                            existed.add(filename);
                        }
                    }
                    const images = json.filter(file => {
                        return isImage(file) && !existed.has(file);
                    });
                    total.value += images.length;
                    jobs.push({folder: path, images});
                }
                if (!total.value) {
                    showAlertDialog('No new photo found.');
                    ctx.emit('update:visible', false);
                    return;
                }
                remainingSecs.value = 15 * total.value;
                startCountdown();

                const CONCURRENCY = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 16) : 4;
                pool = new WorkerPool(CONCURRENCY);

                let avgTime = 0;
                let isSaving = false;
                let lastSaveProgress = 0;

                for (let job of jobs) {
                    const folder = dataset.getFolder(job.folder);
                    await dataset.loadFolderLandmarks(folder.path);

                    const tasks = job.images.map(img => async () => {
                        if (stop.value) return;

                        const path = job.folder + (job.folder.endsWith('/') ? '' : '/') + img;
                        const url = BASE_PATH + '/fs/file?path=' + path;
                        const startTime = Date.now();

                        let image: HTMLImageElement | null = null;
                        try {
                            image = await loadImage(url);
                        } catch (e) {
                            console.error(e);
                        }

                        if (image && pool) {
                            let result: DetectPoseResults | null = null;
                            let errorOccurred = false;
                            try {
                                result = await pool.detect(image);
                            } catch (e) {
                                console.error('Detection failed for', path, e);
                                errorOccurred = true;
                            }

                            if (!errorOccurred) {
                                if (result && result.normalizedLandmarks && result.normalizedLandmarks.length === NUM_OF_LANDMARKS) {
                                    const record = new PhotoPoseLandmarks();
                                    record.filename = img;
                                    record.width = image.width;
                                    record.height = image.height;
                                    for (let i = 0, len = result.normalizedLandmarks.length; i < len; ++i) {
                                        record.normalized.push(result.normalizedLandmarks[i].point);
                                        record.world.push(result.worldLandmarks[i].point);
                                        record.visibility.push(result.normalizedLandmarks[i].visibility);
                                    }
                                    folder.records.push(record);
                                } else {
                                    folder.discard = folder.discard ||[];
                                    folder.discard.push(img);
                                }
                            }
                            
                            currFile.value = path;
                            currImgUrl.value = url;
                            landmarks.value = result ? result.normalizedLandmarks :[];
                            prevImgUrl.value = url;
                        }

                        let dt = Date.now() - startTime;
                        avgTime = (avgTime * progress.value + dt) / (progress.value + 1);
                        progress.value += 1;
                        remainingSecs.value = Math.round(avgTime / 1000 * (total.value - progress.value) / CONCURRENCY);

                        if (progress.value - lastSaveProgress >= SAVE_EVERY_N && !isSaving) {
                            isSaving = true;
                            lastSaveProgress = progress.value;
                            dataset.saveFolderRecords(job.folder).catch(e => {
                                console.error('Failed to save records:', e);
                            }).finally(() => {
                                isSaving = false;
                            });
                        }
                    });

                    const MAX_IN_FLIGHT = CONCURRENCY * 2;
                    const executing = new Set<Promise<void>>();
                    for (const task of tasks) {
                        if (stop.value) break;
                        const p = task();
                        executing.add(p);
                        const clean = () => executing.delete(p);
                        p.then(clean).catch(clean);
                        
                        if (executing.size >= MAX_IN_FLIGHT) {
                            await Promise.race(executing);
                        }
                    }
                    await Promise.all(executing);

                    await dataset.saveFolderRecords(job.folder);
                    if (stop.value) {
                        break;
                    }
                }
            } catch (e) {
                console.error(e);
                showAlertDialog('An error occurred: ' + e);
            }
            stopCountdown();
            if (pool) {
                pool.terminate();
                pool = null;
            }
            if (!stop.value) {
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Pose Search Native', {
                        body: `Scanning complete! Processed ${total.value} photos.`,
                        icon: '/favicon.ico',
                        silent: false
                    });
                }
            }
            ctx.emit('update:visible', false);
        }

        return {
            percent,
            progressText,
            currFile,
            prevImgUrl,
            landmarks,
            currImgUrl,
            remaining,
            stop,
        };
    }
});