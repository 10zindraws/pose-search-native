<template>
    <div class="wrapper cols">
        <div class="options">
            <!-- ── Top bar ── -->
            <div class="cols" style="margin-bottom: 2px;">
                <button class="link"
                        style="font-size: 14px;"
                        @click="showTutorialDialog = true"
                >
                    How to Use?
                </button>
                <div class="fill"></div>
                <button class="link"
                        style="font-size: 14px; margin-right: 4px;"
                        @click="showManagePhotosDialog = true"
                >
                    <span class="icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path
                                d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86l-3 3.87L9 13.14L6 17h12l-3.86-5.14z"
                                fill="currentColor"/>
                        </svg>
                    </span>
                    Manage Photos
                </button>
            </div>

            <!-- ── Gender and Attire radio groups ── -->
            <div style="margin-bottom: 4px;">Filter:</div>
            <div class="cols" style="gap: 8px;">
                <div class="gender-select fill">
                    <label
                        v-for="option in ALL_GENDER_FILTERS"
                        :key="option"
                        class="gender-option"
                        :class="{ active: genderFilter === option }"
                    >
                        <input
                            type="radio"
                            name="gender-filter"
                            :value="option"
                            v-model="genderFilter"
                        />
                        <span class="gender-label">{{ option }}</span>
                    </label>
                </div>
                <div class="gender-select fill">
                    <label
                        v-for="option in ALL_ATTIRE_FILTERS"
                        :key="option"
                        class="gender-option"
                        :class="{ active: attireFilter === option }"
                    >
                        <input
                            type="radio"
                            name="attire-filter"
                            :value="option"
                            v-model="attireFilter"
                        />
                        <span class="gender-label">{{ option }}</span>
                    </label>
                </div>
            </div>

            <!-- Small hint showing how many folders are resolved -->
            <div class="folder-hint">
                {{ searchPaths.length }} folder{{ searchPaths.length !== 1 ? 's' : '' }} selected
            </div>

            <!-- ── Body part + Search ── -->
            <div class="cols" style="margin-top: 8px;">
                <label class="fill" style="margin-right: 4px;">
                    <select v-model="bodyPart"
                            required
                            style="width: 100%;"
                    >
                        <option value="" disabled hidden>Joint / Body Part</option>
                        <option v-for="(matcher, name) in matchers" :value="name">{{ name }}</option>
                    </select>
                </label>
                <button class="primary"
                        :disabled="!searchPaths.length || !bodyPart || (bodyPart === 'Custom' && !customJoints.length)"
                        @click="onSearch"
                >
                    Search
                </button>
            </div>

            <!-- Custom UI -->
            <div v-if="bodyPart === 'Custom'" style="margin-top: 8px; border: 1px solid #d9d9d9; padding: 8px; border-radius: 4px; background: #fff;">
                <div style="font-weight: bold; margin-bottom: 4px;">Custom Pose Filter</div>
                
                <div style="margin-bottom: 8px;">
                    <label style="margin-right: 8px;">
                        <input type="radio" :value="true" v-model="customCameraRelated"> Camera Related
                    </label>
                    <label>
                        <input type="radio" :value="false" v-model="customCameraRelated"> Camera Ignored
                    </label>
                </div>

                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    <label style="width: 100%; font-weight: bold;">
                        <input type="checkbox" :checked="customJoints.length === ALL_JOINTS.length" @change="toggleAllCustomJoints"> All
                    </label>
                    <label v-for="joint in ALL_JOINTS" :key="joint" style="width: 45%;">
                        <input type="checkbox" :value="joint" v-model="customJoints"> {{ joint }}
                    </label>
                </div>
            </div>

            <!-- Controls hint -->
            <div style="margin-top: 4px;">
                <div>Wheel: Rotate Camera / Zoom</div>
                <div>Mouse Right: Move Camera</div>
                <div>Shift + Mouse Left: Rotate Joint</div>
            </div>

            <!-- Skeleton canvas -->
            <skeleton-model-canvas style="width: 100%; height: 400px; min-height: 400px; margin-top: 4px;"
                                   :model="model"
                                   :highlights="matchers[bodyPart]?.highlights"
            />

            <!-- Footer -->
            <div style="margin-top: 8px; line-height: 1.5em;">
                <div style="font-weight: bold;">Pose Search Native</div>
                <div>Version: 20230202</div>
                <div>Author: x6udpngx</div>
                <div>
                    <a class="link" href="https://github.com/x6ud/pose-search-native" target="_blank">Source</a>
                </div>
                <div>
                    <span>Support me:&nbsp;</span>
                    <a class="link" href="https://ko-fi.com/x6udpngx" target="_blank">Ko-fi.com/x6udpngx</a>
                </div>
            </div>
        </div>

        <!-- ── Search results ── -->
        <div class="result fill" ref="searchResultsContainerDom">
            <image-clip v-for="photo in pagedData"
                        class="item"
                        :src="photo.url"
                        :width="200"
                        :height="200"
                        :img-width="photo.width"
                        :img-height="photo.height"
                        :center="photo.center"
                        :related="photo.related"
                        :flip="photo.flipped"
                        @click="onClickPhoto(photo)"
            />
			<div class="example-pagination-block">
                <el-pagination
                    layout="prev, pager, next" 
                    v-model:current-page="currentPage"
                    :page-size="pageSize"
                    :total="searchResults.length"
                    @current-change="handlePageChange"
                />
            </div>
        </div>
    </div>

    <tutorial-dialog v-model:visible="showTutorialDialog"/>
    <manage-photos-dialog v-model:visible="showManagePhotosDialog"/>
    <image-viewer v-model:visible="showImageViewer"
                  :src="imageUrl"
                  :flip="imageFlip"
    />
</template>

<script src="./App.ts"></script>

<style src="./ui.scss"></style>

<style lang="scss" scoped>
.wrapper {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 4px;
    font-size: 12px;
    color: #989898;

    .options {
        width: 320px;
        height: 100%;
        margin-right: 4px;
        overflow: auto;
    }

    .result {
        box-sizing: border-box;
        height: 100%;
        padding: 4px;
        border-radius: 2px;
        border: solid 1px #d9d9d9;
        overflow: auto;

        .item {
            float: left;
            margin: 0 4px 4px;
        }
    }
}

/* ── Gender radio group ────────────────────────────────────────────────────── */
.gender-select {
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-sizing: border-box;
    padding: 6px 8px;
    border: solid 1px #D9D9D9;
    border-radius: 4px;
    background: #fff;
}

.gender-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: #000;
    padding: 2px 0;

    /* Hide the native radio and replace with a styled circle */
    input[type="radio"] {
        appearance: none;
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid #767676;
        background: #fff;
        flex-shrink: 0;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;

        &:checked {
            border-color: #1979CA;
            background: #1979CA;
            box-shadow: inset 0 0 0 3px #fff;
        }
    }

    &.active .gender-label {
        font-weight: 600;
        color: #1979CA;
    }

    .gender-label {
        user-select: none;
    }
}

/* Small resolved-folder count hint */
.folder-hint {
    margin-top: 4px;
    font-size: 11px;
    color: #aaa;
}

.example-pagination-block{
    position: absolute;
    margin-bottom: 16px;
    bottom: 0;
    right: 16px;
    z-index: 999;
}
</style>
