import { Link2, Replace, RotateCcw, Upload, VideoOff } from 'lucide-react'
import { memo, useId, useState } from 'react'
import { MAX_VIDEO_BYTES } from '../../config'
import { parseVideoUrl } from '../../lib/embed'
import { formatBytes } from '../../lib/media'
import { store } from '../../lib/store'
import type { VideoDraft } from './blocks'
import FilePickerButton from './FilePickerButton'
import { blurOnEnter } from './keys'
import type { PendingUpload } from './reducer'
import Segmented from './Segmented'
import type { BlockActions } from './useDayEditor'
import styles from './VideoBlockEditor.module.css'

interface VideoBlockEditorProps {
  block: VideoDraft
  /** The clip on its way into this block, or the one whose upload failed. */
  upload: PendingUpload | undefined
  actions: BlockActions
}

const SOURCES = [
  { value: 'upload', label: 'Upload a clip', icon: <Upload size={16} /> },
  { value: 'embed', label: 'Paste a link', icon: <Link2 size={16} /> },
] as const

function Clip({ path }: { path: string }) {
  const src = store.mediaUrl(path)
  const [broken, setBroken] = useState(false)
  // The file may be gone (a restored backup can outlive it), or in a format this browser can't play.
  if (!src || broken) {
    return (
      <p className={styles.unplayable}>
        <VideoOff size={20} />
        This clip can't be played here. Replace it, or remove it.
      </p>
    )
  }
  return <video className={styles.clip} src={src} controls playsInline preload="metadata" onError={() => setBroken(true)} />
}

function UploadProgress({ upload, onCancel }: { upload: PendingUpload; onCancel(): void }) {
  const percent = Math.round(upload.progress * 100)
  return (
    <div className={styles.stack}>
      <p className={styles.name}>{upload.name}</p>
      <div className={styles.meter}>
        <div
          className={`progress ${styles.bar}`}
          role="progressbar"
          aria-label={`Uploading ${upload.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <span className={styles.percent}>{upload.status === 'queued' ? 'Waiting…' : `${percent}%`}</span>
        <button type="button" className={`btn btn-ghost ${styles.word}`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function VideoBlockEditor({ block, upload, actions }: VideoBlockEditorProps) {
  const linkId = useId()
  const problemId = useId()

  const failed = upload?.status === 'failed' ? upload : undefined
  const inFlight = upload && !failed ? upload : undefined
  const tooLarge = failed !== undefined && failed.size > MAX_VIDEO_BYTES

  const link = block.url.trim()
  const embed = link ? parseVideoUrl(link) : null
  const invalidLink = link !== '' && !embed

  const setSource = (source: VideoDraft['source']) => {
    // A failed upload has nothing left to say once the owner turns to a link.
    if (source === 'embed' && failed) actions.dropUpload(failed.id)
    actions.changeVideo(block.id, { source })
  }

  const choose = (files: File[]) => actions.uploadVideo(block.id, files[0])

  const removeClip = () => {
    // Asked first, because a clip can take a long time to upload again.
    if (window.confirm('Remove this clip?')) actions.clearVideo(block.id)
  }

  return (
    <div className={styles.video}>
      {/* With a clip in place there is nothing to switch to: it has to be removed first. */}
      {!block.path && (
        <Segmented
          label="Where the video comes from"
          name={`video-source-${block.id}`}
          value={block.source}
          options={SOURCES}
          disabled={inFlight !== undefined}
          onChange={setSource}
        />
      )}

      {block.source === 'upload' ? (
        <div className={styles.stack}>
          {block.path && <Clip key={block.path} path={block.path} />}

          {inFlight && <UploadProgress upload={inFlight} onCancel={() => actions.dropUpload(inFlight.id)} />}

          {failed && (
            <div className={styles.stack}>
              <p className={styles.problem} role="alert">
                {failed.error}
              </p>
              <div className={styles.row}>
                {/* Trying the same oversized file again can't work; a link can. */}
                {tooLarge ? (
                  !block.path && (
                    <button type="button" className={`btn ${styles.word}`} onClick={() => setSource('embed')}>
                      <Link2 size={16} />
                      Paste a link instead
                    </button>
                  )
                ) : (
                  <button type="button" className={`btn ${styles.word}`} onClick={() => actions.retryUpload(failed.id)}>
                    <RotateCcw size={16} />
                    Try again
                  </button>
                )}
                <button type="button" className={`btn btn-ghost ${styles.word}`} onClick={() => actions.dropUpload(failed.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {!inFlight && (
            <div className={styles.row}>
              {block.path ? (
                <>
                  <FilePickerButton className={`btn ${styles.word}`} accept="video/*" onFiles={choose}>
                    <Replace size={16} />
                    Replace
                  </FilePickerButton>
                  <button type="button" className={`btn btn-danger ${styles.word}`} onClick={removeClip}>
                    Remove
                  </button>
                </>
              ) : (
                <FilePickerButton className={`btn ${styles.word}`} accept="video/*" onFiles={choose}>
                  <Upload size={16} />
                  {failed ? 'Choose another clip' : 'Choose a clip'}
                </FilePickerButton>
              )}
            </div>
          )}

          <p className="hint">
            Clips can be up to {formatBytes(MAX_VIDEO_BYTES)}.
            {!block.path && ' For anything bigger, put it on YouTube or Vimeo and paste the link.'}
          </p>
        </div>
      ) : (
        <div className={styles.stack}>
          <div className="field">
            <label className="label" htmlFor={linkId}>
              YouTube or Vimeo link
            </label>
            <input
              id={linkId}
              className="input"
              type="url"
              inputMode="url"
              value={block.url}
              placeholder="https://youtu.be/…"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onKeyDown={blurOnEnter}
              aria-invalid={invalidLink}
              aria-describedby={invalidLink ? problemId : undefined}
              onChange={(event) => actions.changeVideo(block.id, { url: event.target.value })}
            />
            {invalidLink && (
              <p id={problemId} className={styles.problem}>
                Paste a YouTube or Vimeo link
              </p>
            )}
          </div>
          {embed && (
            <div className={embed.aspectRatio === '9 / 16' ? `${styles.player} ${styles.tall}` : styles.player}>
              <iframe
                src={embed.embedUrl}
                title="Video preview"
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                // YouTube refuses to play when it is sent no referrer at all.
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}
        </div>
      )}

      <input
        className="input"
        type="text"
        value={block.caption}
        placeholder="Add a caption"
        aria-label="Video caption"
        enterKeyHint="done"
        onKeyDown={blurOnEnter}
        onChange={(event) => actions.changeVideo(block.id, { caption: event.target.value })}
      />
    </div>
  )
}

export default memo(VideoBlockEditor)
