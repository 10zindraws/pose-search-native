<template>
    <popup-dialog :visible="visible"
                  modal
                  title="Manage Photos"
                  closable
                  @update:visible="$emit('update:visible', $event)"
    >
        <div class="rows"
             style="width: 860px; height: 520px; max-width: 100%; max-height: 100%;"
        >
            <!-- ── Toolbar ── -->
            <div class="cols" style="margin-bottom: 4px; gap: 8px; align-items: center;">
                <button class="link"
                        style="font-size: 14px;"
                        @click="onAddFolder"
                >
                    <span class="icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><g fill="none"><path
                            d="M6.5 1.75a.75.75 0 0 0-1.5 0V5H1.75a.75.75 0 0 0 0 1.5H5v3.25a.75.75 0 0 0 1.5 0V6.5h3.25a.75.75 0 0 0 0-1.5H6.5V1.75z"
                            fill="currentColor"></path></g></svg>
                    </span>
                    Add Folder
                </button>
                <div class="fill"></div>
                
                <!-- Filter Buttons -->
                <div class="cols" style="gap: 4px;" v-if="anyChecked">
                    <button class="normal" @click="applyGenderToSelected('Female')">Female</button>
                    <button class="normal" @click="applyGenderToSelected('Male')">Male</button>
                    <div style="width: 1px; background: #ccc; margin: 0 4px;"></div>
                    <button class="normal" @click="applyAttireToSelected('Nude/Undies')">Nude/Undies</button>
                    <button class="normal" @click="applyAttireToSelected('Clothed')">Clothed</button>
                </div>

                <button class="primary"
                        style="font-size: 14px; margin-left: 8px;"
                        @click="onScan"
                        :disabled="!anyChecked"
                >
                    <span class="icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path
                            d="M18 13v7H4V6h5.02c.05-.71.22-1.38.48-2H2v18h18v-7l-2-2zm-1.5 5h-11l2.75-3.53l1.96 2.36l2.75-3.54L16.5 18zm2.8-9.11c.44-.7.7-1.51.7-2.39C20 4.01 17.99 2 15.5 2S11 4.01 11 6.5s2.01 4.5 4.49 4.5c.88 0 1.7-.26 2.39-.7L21 13.42L22.42 12L19.3 8.89zM15.5 9a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 1 0 5z"
                            fill="currentColor"></path></svg>
                    </span>
                    Scan Photos
                </button>
                <button class="normal"
                        style="font-size: 14px; margin-left: 8px;"
                        @click="onClearDiscarded"
                        :disabled="!anyChecked"
                >
                    Clear Discarded
                </button>
            </div>

            <!-- ── Inline picker (shown after folder is chosen) ── -->
            <div v-if="showPicker" class="picker-bar cols">
                <span class="pending-path" :title="pendingPath">{{ pendingPath }}</span>
                
                <div style="width: 1px; background: #ccc; margin: 0 8px;"></div>
                
                <label v-for="g in GENDER_OPTIONS" :key="g" class="pill-label">
                    <input type="radio" name="pending-gender" :value="g" v-model="pendingGender" />
                    <span :class="['pill', { active: pendingGender === g }]">{{ g }}</span>
                </label>
                
                <div style="width: 1px; background: #ccc; margin: 0 8px;"></div>
                
                <label v-for="a in ATTIRE_OPTIONS" :key="a" class="pill-label">
                    <input type="radio" name="pending-attire" :value="a" v-model="pendingAttire" />
                    <span :class="['pill', { active: pendingAttire === a }]">{{ a }}</span>
                </label>

                <div class="fill"></div>

                <button class="primary" style="font-size: 13px;" @click="onConfirmAdd">Add</button>
                <button class="normal" style="margin-left: 4px; font-size: 13px;" @click="onCancelAdd">Cancel</button>
            </div>

            <!-- ── Folder list ── -->
            <div class="list fill">
                <div class="item cols"
                     v-for="(folder, index) in dataset.folders"
                     :key="folder.path"
                     :class="{ selected: checked[folder.path], disabled: folder.disabled }"
                     @mousedown="onMouseDown($event, index, folder.path)"
                     @mouseenter="onMouseEnter($event, index, folder.path)"
                >
                    <div class="fill cols" style="align-items: center; gap: 8px; overflow: hidden;">
                        <input type="checkbox" :checked="checked[folder.path]" style="pointer-events: none;">
                        <span class="path-text" :title="folder.path">{{ folder.path }}</span>
                    </div>
                    <div class="record-count">{{ folder.records.length }} Poses / {{ (folder.records.length + (folder.discard?.length || 0)) }} Scanned</div>
                    <div class="label-pill">{{ dataset.getGenderForPath(folder.path) || 'Unknown' }}</div>
                    <div class="label-pill">{{ dataset.getAttireForPath(folder.path) || 'Unknown' }}</div>
                    <div class="label-pill" :class="folder.disabled ? 'status-disabled' : 'status-enabled'">
                        {{ folder.disabled ? 'Disabled' : 'Enabled' }}
                    </div>
                </div>
            </div>
        </div>
        <template #buttons>
            <div class="cols fill" style="width: 100%; align-items: center;">
                <button class="link" style="color: #E81123;" @click="onRemoveSelected" :disabled="!anyChecked">
                    Remove Selected
                </button>
                <div class="fill"></div>
                <button class="normal" @click="onDisableSelected" :disabled="!anyChecked">Disable</button>
                <button class="primary" style="margin-left: 8px;" @click="onEnableSelected" :disabled="!anyChecked">Enable</button>
            </div>
        </template>
    </popup-dialog>

    <scan-photos-dialog v-model:visible="showScanPhotosDialog"
                        :paths="scanPaths"
    />
</template>

<script src="./ManagePhotosDialog.ts"></script>

<style lang="scss" scoped>
.list {
    border-radius: 3px;
    border: solid 1px #D9D9D9;
    overflow: auto;
    user-select: none;

    .item {
        align-items: center;
        white-space: nowrap;
        border-bottom: solid 1px #f0f0f0;
        cursor: pointer;

        &:last-child {
            border-bottom: none;
        }

        &.selected {
            background-color: #e6f2ff;
        }

        &:hover {
            background-color: #f5f5f5;
        }
        
        &.selected:hover {
            background-color: #d9ebff;
        }

        & > * {
            padding: 4px 8px;
        }

        .path-text {
            overflow: hidden;
            text-overflow: ellipsis;
        }

        &.disabled {
            color: #aaa;
            text-decoration: line-through;
            background-color: #fafafa;

            &:hover {
                background-color: #f0f0f0;
            }

            &.selected {
                background-color: #f0e6e6;
            }
        }
    }
}

.record-count {
    color: #888;
    font-size: 12px;
    white-space: nowrap;
}

.picker-bar {
    align-items: center;
    background: #f7f9ff;
    border: solid 1px #c8d8f0;
    border-radius: 4px;
    padding: 6px 10px;
    margin-bottom: 6px;
    font-size: 13px;
    flex-wrap: wrap;
    gap: 4px;

    .pending-path {
        font-family: monospace;
        font-size: 11px;
        color: #555;
        max-width: 320px;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.label-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    background: #eee;
    color: #555;
    font-size: 11px;
    font-weight: 500;
    min-width: 60px;
    text-align: center;

    &.status-enabled {
        background-color: #e4f2e3;
        color: #3a7538;
    }
    &.status-disabled {
        background-color: #fce3e3;
        color: #9b3e3e;
    }
}

.pill-label {
    display: inline-flex;
    align-items: center;
    cursor: pointer;

    input[type="radio"] {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
    }
}

.pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    border: solid 1px #ccc;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    color: #555;
    background: #f5f5f5;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    user-select: none;

    &.active {
        background: #1979CA;
        border-color: #1979CA;
        color: #fff;
    }
}
</style>