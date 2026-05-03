import {computed, defineComponent, onMounted, onBeforeUnmount, reactive, ref} from 'vue';
import PopupDialog from '../components/popup/PopupDialog/PopupDialog.vue';
import {DatasetFolder, GenderCategory, AttireCategory, useDataset} from '../dataset';
import {showConfirmDialog, showSelectFolderDialog, showAlertDialog} from './dialogs';
import ScanPhotosDialog from './ScanPhotosDialog.vue';
import {request} from '../utils/request';

export default defineComponent({
    components: {PopupDialog, ScanPhotosDialog},
    props: {
        visible: Boolean,
    },
    emits:['update:visible'],
    setup(props, { emit }) {
        const dataset = useDataset();

        const checked = reactive<{[path: string]: boolean }>({});
        const anyChecked = computed(function () {
            return !!dataset.folders.filter(folder => checked[folder.path]).length;
        });

        const showScanPhotosDialog = ref(false);
        const scanPaths = ref<string[]>([]);

        const lastChosenGender = ref<GenderCategory>(localStorage.getItem('last-gender') as GenderCategory || 'Female');
        const lastChosenAttire = ref<AttireCategory>(localStorage.getItem('last-attire') as AttireCategory || 'Nude/Undies');

        const pendingPath = ref('');
        const showPicker = ref(false);
        const pendingGender = ref<GenderCategory>('Female');
        const pendingAttire = ref<AttireCategory>('Nude/Undies');

        onMounted(async function () {
            await dataset.load();
            for (let folder of dataset.folders) {
                dataset.loadFolderRecords(folder.path);
            }
            window.addEventListener('mouseup', onMouseUp);
            window.addEventListener('keydown', onKeyDown);
        });

        onBeforeUnmount(() => {
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('keydown', onKeyDown);
        });

        function onKeyDown(event: KeyboardEvent) {
            if (props.visible && event.key === 'Escape') {
                emit('update:visible', false);
            }
        }

        async function onAddFolder() {
            let path = await showSelectFolderDialog();
            if (!path) {
                return;
            }

            path = path.replaceAll('\\', '/');
            if (!path.endsWith('/')) path += '/';

            if (dataset.folders.find(f => f.path.toLowerCase() === path.toLowerCase())) {
                return;
            }
            pendingPath.value = path;
            pendingGender.value = lastChosenGender.value;
            pendingAttire.value = lastChosenAttire.value;
            showPicker.value = true;
        }

        async function onConfirmAdd() {
            const path = pendingPath.value;
            showPicker.value = false;

            lastChosenGender.value = pendingGender.value;
            lastChosenAttire.value = pendingAttire.value;
            localStorage.setItem('last-gender', pendingGender.value);
            localStorage.setItem('last-attire', pendingAttire.value);

            dataset.genderFolders[pendingGender.value].push(path);
            dataset.attireFolders[pendingAttire.value].push(path);
            dataset._rebuildFolders();

            const folder = dataset.getFolder(path);
            await dataset.loadFolderRecords(folder.path);
            if (!folder.records.length) {
                folder.recordsLoaded = true;
                folder.landmarksLoaded = true;
            }
            checked[path] = true;
            await dataset.save();
        }

        function onCancelAdd() {
            showPicker.value = false;
            pendingPath.value = '';
        }

        async function applyGenderToSelected(gender: GenderCategory) {
            for (const path in checked) {
                if (checked[path]) {
                    dataset.assignGender(path, gender);
                }
            }
            await dataset.save();
        }

        async function applyAttireToSelected(attire: AttireCategory) {
            for (const path in checked) {
                if (checked[path]) {
                    dataset.assignAttire(path, attire);
                }
            }
            await dataset.save();
        }

        async function onRemoveSelected() {
            const selectedPaths = Object.keys(checked).filter(p => checked[p]);
            if (!selectedPaths.length) return;
            
            const msg = selectedPaths.length > 1
                ? "Are you sure you want to remove the folders from the list (won't delete files)?"
                : "Are you sure you want to remove the folder from the list (won't delete files)?";
                
            if (await showConfirmDialog(msg)) {
                for (const path of selectedPaths) {
                    dataset.genderFolders.Female = dataset.genderFolders.Female.filter(p => p !== path);
                    dataset.genderFolders.Male = dataset.genderFolders.Male.filter(p => p !== path);
                    dataset.attireFolders['Nude/Undies'] = dataset.attireFolders['Nude/Undies'].filter(p => p !== path);
                    dataset.attireFolders.Clothed = dataset.attireFolders.Clothed.filter(p => p !== path);
                    delete checked[path];
                }
                dataset._rebuildFolders();
                await dataset.save();
                lastSelectedIndex = -1;
            }
        }

        function onScan() {
            if ('Notification' in window && Notification.permission !== 'granted') {
                Notification.requestPermission();
            }
            scanPaths.value = dataset.folders.filter(folder => checked[folder.path]).map(folder => folder.path);
            showScanPhotosDialog.value = !!scanPaths.value.length;
        }

        async function onClearDiscarded() {
            const selectedPaths = Object.keys(checked).filter(p => checked[p]);
            if (!selectedPaths.length) return;
            
            if (await showConfirmDialog("Are you sure you want to clear the discarded list for selected folders? This will allow previously skipped images to be scanned again.")) {
                for (const path of selectedPaths) {
                    const folder = dataset.getFolder(path);
                    folder.discard =[];
                    await request('/ds/clear_discard?path=' + encodeURIComponent(folder.path), { method: 'post' });
                }
                showAlertDialog("Discarded lists cleared.");
            }
        }

        async function onEnableSelected() {
            const selectedPaths = Object.keys(checked).filter(p => checked[p]);
            if (!selectedPaths.length) return;

            for (const path of selectedPaths) {
                const folder = dataset.getFolder(path);
                if (folder) {
                    folder.disabled = false;
                }
            }
            await dataset.save();
        }

        async function onDisableSelected() {
            const selectedPaths = Object.keys(checked).filter(p => checked[p]);
            if (!selectedPaths.length) return;

            for (const path of selectedPaths) {
                const folder = dataset.getFolder(path);
                if (folder) {
                    folder.disabled = true;
                }
            }
            await dataset.save();
        }

        let lastSelectedIndex = -1;
        let isDragging = false;
        let dragStartState = true;

        function onMouseDown(event: MouseEvent, index: number, path: string) {
            if (event.button !== 0) return;
            
            if (event.shiftKey && lastSelectedIndex !== -1) {
                const start = Math.min(lastSelectedIndex, index);
                const end = Math.max(lastSelectedIndex, index);
                if (!event.ctrlKey && !event.metaKey) {
                    for (const p in checked) checked[p] = false;
                }
                for (let i = start; i <= end; i++) {
                    checked[dataset.folders[i].path] = true;
                }
                isDragging = true;
                dragStartState = true;
                event.preventDefault();
            } else if (event.ctrlKey || event.metaKey) {
                checked[path] = !checked[path];
                lastSelectedIndex = index;
                isDragging = true;
                dragStartState = checked[path];
                event.preventDefault();
            } else {
                for (const p in checked) checked[p] = false;
                checked[path] = true;
                lastSelectedIndex = index;
                isDragging = true;
                dragStartState = true;
                event.preventDefault();
            }
        }

        function onMouseEnter(event: MouseEvent, index: number, path: string) {
            if (isDragging) {
                if (event.buttons === 0) {
                    isDragging = false;
                    return;
                }
                checked[path] = dragStartState;
                lastSelectedIndex = index;
            }
        }

        function onMouseUp() {
            isDragging = false;
        }

        return {
            dataset,
            checked,
            anyChecked,
            showScanPhotosDialog,
            scanPaths,
            showPicker,
            pendingPath,
            pendingGender,
            pendingAttire,
            GENDER_OPTIONS:['Female', 'Male'] as GenderCategory[],
            ATTIRE_OPTIONS:['Nude/Undies', 'Clothed'] as AttireCategory[],
            onAddFolder,
            onConfirmAdd,
            onCancelAdd,
            applyGenderToSelected,
            applyAttireToSelected,
            onRemoveSelected,
            onScan,
            onClearDiscarded,
            onMouseDown,
            onMouseEnter,
            onEnableSelected,
            onDisableSelected,
        };
    }
});