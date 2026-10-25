<script setup lang="ts">
/**
 * Ports the `.media-drag-target` blocks of question_view.html (editable branch)
 * and openMediaInput, mediaFileSelected, mediaDragEnter/Leave/Dropped and
 * deleteMedia from question_pack.js.
 *
 * Accepts a file from the picker, a file dropped from the desktop, or an
 * image dragged from another tab (fetched through the /packs/fetch proxy).
 * What to do with the file, and how to preview it, is the parent's business:
 * the preview goes in the default slot, extra buttons in `controls`.
 */
import { ref } from "vue";

import { droppedMediaUrl, fetchMediaUrl } from "../media";

const props = defineProps<{
  title: string;
  /** MIME types this target takes. */
  accept: string[];
  /** For the file picker, e.g. ".png, .jpg". */
  acceptExtensions: string;
  hasMedia: boolean;
}>();

const emit = defineEmits<{
  file: [file: File];
  remove: [];
}>();

const input = ref<HTMLInputElement | null>(null);
const hovering = ref(false);
const loading = ref(false);

function openPicker(event: MouseEvent): void {
  // Clicking a video's own controls shouldn't open the file dialog, and the
  // picker's own synthetic click bubbles back up through here.
  if ((event.target as Element).closest("video, input, .media-control-btn")) return;
  input.value?.click();
}

function accepted(file: File | undefined): file is File {
  return !!file && props.accept.includes(file.type);
}

function onPicked(): void {
  const file = input.value?.files?.[0];
  if (input.value) input.value.value = "";
  if (!file) return;

  if (accepted(file)) emit("file", file);
  else alert("Invalid file type.");
}

function onDragLeave(event: DragEvent): void {
  const target = event.currentTarget as HTMLElement;
  if (!target.contains(event.relatedTarget as Node | null)) hovering.value = false;
}

async function onDrop(event: DragEvent): Promise<void> {
  hovering.value = false;
  const transfer = event.dataTransfer;
  if (!transfer) return;

  const files = transfer.files;
  if (files.length > 0) {
    if (files.length === 1 && accepted(files[0])) emit("file", files[0]);
    else alert("Invalid file type.");
    return;
  }

  // Read synchronously: the DataTransfer is emptied once this handler returns.
  const url = droppedMediaUrl(transfer);
  if (!url) {
    alert("Could not extract the given image.");
    return;
  }

  loading.value = true;
  try {
    emit("file", await fetchMediaUrl(url, props.accept));
  } catch (err) {
    console.warn("Could not fetch dropped media", url, err);
    alert("Could not extract the given image.");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="media-drag-target"
    :class="{ 'target-empty': !hasMedia, 'media-drag-hover': hovering }"
    @click="openPicker"
    @dragover.prevent
    @dragenter.prevent="hovering = true"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <template v-if="hasMedia">
      <button
        class="media-delete-btn delete-button media-control-btn"
        title="Remove"
        @click.stop="emit('remove')"
      >
        &times;
      </button>
      <slot name="controls" />
    </template>

    <div v-if="hasMedia" class="drag-target-preview-wrapper">
      <slot />
    </div>

    <div v-else-if="!hovering && !loading" class="drag-target-tooltip">
      <h3>{{ title }}</h3>
      Drop file or click here to upload
    </div>

    <div v-if="loading" class="drag-target-loading">
      <div class="loading-icon" />
    </div>

    <input
      ref="input"
      class="drag-input"
      type="file"
      :accept="acceptExtensions"
      hidden
      @change="onPicked"
    />
  </div>
</template>
