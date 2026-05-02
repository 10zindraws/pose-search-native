import {computed, defineComponent, nextTick, onMounted, ref, watch} from 'vue';
import ImageClip from './components/ImageClip/ImageClip.vue';
import ImageViewer from './components/ImageViewer/ImageViewer.vue';
import {BodyPart} from './components/SkeletonModelCanvas/model/BodyPart';
import SkeletonModel from './components/SkeletonModelCanvas/model/SkeletonModel';
import SkeletonModelCanvas from './components/SkeletonModelCanvas/SkeletonModelCanvas.vue';
import {GenderFilter, AttireFilter, useDataset} from './dataset';
import ManagePhotosDialog from './dialogs/ManagePhotosDialog.vue';
import TutorialDialog from './dialogs/TutorialDialog.vue';
import ChestMatcher from './search/matcher/ChestMatcher';
import CrotchMatcher from './search/matcher/CrotchMatcher';
import ElbowMatcher from './search/matcher/ElbowMatcher';
import FaceMatcher from './search/matcher/FaceMatcher';
import HipMatcher from './search/matcher/HipMatcher';
import KneeMatcher from './search/matcher/KneeMatcher';
import PoseMatcher from './search/matcher/PoseMatcher';
import ShoulderMatcher from './search/matcher/ShoulderMatcher';
import CustomMatcher from './search/matcher/CustomMatcher';
import HandMatcher from './search/matcher/HandMatcher';
import FootMatcher from './search/matcher/FootMatcher';
import {search, SearchResult} from './search/search';

// ─── localStorage key ─────────────────────────────────────────────────────────
const GENDER_FILTER_KEY = 'pose-search-gender-filter';
const ATTIRE_FILTER_KEY = 'pose-search-attire-filter';

export default defineComponent({
    components: {
        ImageClip,
        ImageViewer,
        SkeletonModelCanvas,
        ManagePhotosDialog,
        TutorialDialog,
    },
    setup() {
        const dataset = useDataset();

        // ── Gender filter (persisted in localStorage) ─────────────────────────
        const ALL_GENDER_FILTERS: GenderFilter[] = ['Female', 'Male', 'Both'];

        const savedFilter = localStorage.getItem(GENDER_FILTER_KEY) as GenderFilter | null;
        const genderFilter = ref<GenderFilter>(
            savedFilter && ALL_GENDER_FILTERS.includes(savedFilter) ? savedFilter : 'Both'
        );

        // Persist whenever the user changes the selection.
        watch(genderFilter, (val) => {
            localStorage.setItem(GENDER_FILTER_KEY, val);
        });

        const ALL_ATTIRE_FILTERS: AttireFilter[] = ['Nude/Undies', 'Clothed', 'Both'];
        const savedAttireFilter = localStorage.getItem(ATTIRE_FILTER_KEY) as AttireFilter | null;
        const attireFilter = ref<AttireFilter>(
            savedAttireFilter && ALL_ATTIRE_FILTERS.includes(savedAttireFilter) ? savedAttireFilter : 'Both'
        );

        watch(attireFilter, (val) => {
            localStorage.setItem(ATTIRE_FILTER_KEY, val);
        });

        /**
         * The resolved list of folder paths that the current gender filter maps
         * to. This is what gets passed to the search function – identical to
         * how searchPaths worked before, just derived from the gender selection
         * instead of individual checkboxes.
         */
        const searchPaths = computed<string[]>(() => {
            return dataset.getPathsForFilter(genderFilter.value, attireFilter.value);
        });

        // ── Body-part / matcher config ────────────────────────────
        const bodyPart = ref('');
        const model = new SkeletonModel();
        
        const customJoints = ref<string[]>([]);
        const customCameraRelated = ref(true);
        
        const ALL_JOINTS =[
            'Face', 'Chest', 'Left Shoulder', 'Right Shoulder', 'Left Elbow', 'Right Elbow',
            'Crotch', 'Left Hip', 'Right Hip', 'Left Knee', 'Right Knee',
            'Left Hand', 'Right Hand', 'Left Foot', 'Right Foot'
        ];

        const matchers: {
            [name: string]: {
                matcher: PoseMatcher,
                highlights: BodyPart[],
            }
        } = {
            'Face': {
                matcher: new FaceMatcher(),
                highlights: [BodyPart.head]
            },
            'Chest': {
                matcher: new ChestMatcher(),
                highlights: [BodyPart.trunk]
            },
            'Left Shoulder': {
                matcher: new ShoulderMatcher(true),
                highlights: [BodyPart.trunk, BodyPart.leftUpperArm]
            },
            'Right Shoulder': {
                matcher: new ShoulderMatcher(false),
                highlights: [BodyPart.trunk, BodyPart.rightUpperArm]
            },
            'Left Elbow': {
                matcher: new ElbowMatcher(true),
                highlights: [BodyPart.leftUpperArm, BodyPart.leftLowerArm]
            },
            'Right Elbow': {
                matcher: new ElbowMatcher(false),
                highlights: [BodyPart.rightUpperArm, BodyPart.rightLowerArm]
            },
            'Crotch': {
                matcher: new CrotchMatcher(),
                highlights: [BodyPart.trunk]
            },
            'Left Hip': {
                matcher: new HipMatcher(true),
                highlights: [BodyPart.trunk, BodyPart.leftThigh]
            },
            'Right Hip': {
                matcher: new HipMatcher(false),
                highlights: [BodyPart.trunk, BodyPart.rightThigh]
            },
            'Left Knee': {
                matcher: new KneeMatcher(true),
                highlights: [BodyPart.leftThigh, BodyPart.leftCalf]
            },
            'Right Knee': {
                matcher: new KneeMatcher(false),
                highlights:[BodyPart.rightThigh, BodyPart.rightCalf]
            },
            'Left Hand': {
                matcher: new HandMatcher(true),
                highlights: [BodyPart.leftLowerArm, BodyPart.leftHand]
            },
            'Right Hand': {
                matcher: new HandMatcher(false),
                highlights:[BodyPart.rightLowerArm, BodyPart.rightHand]
            },
            'Left Foot': {
                matcher: new FootMatcher(true),
                highlights: [BodyPart.leftCalf, BodyPart.leftFoot]
            },
            'Right Foot': {
                matcher: new FootMatcher(false),
                highlights:[BodyPart.rightCalf, BodyPart.rightFoot]
            },
            'Custom': {
                matcher: null as any,
                highlights: []
            }
        };

        watch([bodyPart, customJoints], () => {
            if (bodyPart.value === 'Custom') {
                const highlights: BodyPart[] =[];
                for (const joint of customJoints.value) {
                    if (matchers[joint]) {
                        highlights.push(...matchers[joint].highlights);
                    }
                }
                matchers['Custom'].highlights = [...new Set(highlights)];
            }
        });

        const toggleAllCustomJoints = (e: Event) => {
            if ((e.target as HTMLInputElement).checked) {
                customJoints.value = [...ALL_JOINTS];
            } else {
                customJoints.value =[];
            }
        };

        // ── Dialog / result state ─────────────────────────────────────────────
        const showManagePhotosDialog = ref(false);
        const showTutorialDialog = ref(false);
        const searchResultsContainerDom = ref<HTMLElement>();
        const searchResults = ref<SearchResult[]>([]);
        const imageUrl = ref('');
        const imageFlip = ref(false);
        const showImageViewer = ref(false);
		
		const currentPage = ref(1);
        const pageSize = ref(25);
        const pagedData = computed(() => {
            console.log('searchResults.value.length', searchResults.value.length)
            const startIndex = (currentPage.value - 1) * pageSize.value;
            return searchResults.value.slice(startIndex, startIndex + pageSize.value);
          });
        const handlePageChange = (page: any) => {
            console.log(`Current page: ${page}`);
          }

        // ── Search (unchanged logic, now uses gender-resolved paths) ──────────
        async function onSearch() {
            searchResults.value =[];
            searchResultsContainerDom.value!.scrollTop = 0;
            await nextTick();
            const result: SearchResult[] =[];
            
            let matcher: PoseMatcher;
            if (bodyPart.value === 'Custom') {
                matcher = new CustomMatcher(customJoints.value, customCameraRelated.value);
            } else {
                matcher = matchers[bodyPart.value].matcher!;
            }
            
            for (let path of searchPaths.value) {
                result.push(...await search(model, path, matcher));
            }
            result.sort((a, b) => b.score - a.score);
            searchResults.value = result;
        }

        function onClickPhoto(photo: SearchResult) {
            imageUrl.value = photo.url;
            imageFlip.value = photo.flipped;
            showImageViewer.value = true;
        }

        onMounted(async function () {
            await dataset.load();
        });

        return {
            dataset,
            genderFilter,
            ALL_GENDER_FILTERS,
            attireFilter,
            ALL_ATTIRE_FILTERS,
            searchPaths,
            bodyPart,
            model,
            matchers,
            showManagePhotosDialog,
            showTutorialDialog,
            searchResultsContainerDom,
            searchResults,
            imageUrl,
            imageFlip,
            showImageViewer,
			currentPage,
            pageSize,
            pagedData,
            handlePageChange,
            onSearch,
            onClickPhoto,
            customJoints,
            customCameraRelated,
            ALL_JOINTS,
            toggleAllCustomJoints,
        };
    }
});